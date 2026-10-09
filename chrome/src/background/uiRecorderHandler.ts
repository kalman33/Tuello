import { HttpReturn } from '../../../src/app/recorder-http/models/http.return';
import { Action } from '../../../src/app/spy-http/models/Action';
import { ConsoleLogEntry } from '../../../src/app/spy-http/models/ConsoleLogEntry';
import { ActionType } from '../../../src/app/spy-http/models/ActionType';
import { Record } from '../../../src/app/spy-http/models/Record';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { WindowSize } from '../../../src/app/spy-http/models/WindowSize';
import { IFrame } from '../models/IFrame';
import { loadCompressed, saveCompressed } from '../utils/compression';
import { removeDuplicateEntries } from '../utils/utils';

/** Délai de debounce pour la sauvegarde (ms) */
const SAVE_DEBOUNCE_DELAY_MS = 300;

/** Limite du nombre d'actions avant avertissement */
const MAX_ACTIONS_WARNING = 500;

/** Limite dure du nombre d'actions (au-delà, les nouvelles actions sont ignorées) */
const MAX_ACTIONS_LIMIT = 2000;

/** État d'enregistrement isolé par onglet */
interface RecordingState {
  lastAction: Action | null;
  last: number;
  record: Record | null;
  pause: boolean;
  /** Flag pour éviter de spammer les avertissements (par onglet, comme le reste de l'état) */
  maxActionsWarningShown: boolean;
  /** Horodatage de la dernière miniature de navigation capturée (debounce, voir addNavigate) */
  lastCaptureAt?: number;
  /** Capture "avant" démarrée au `mousedown` (voir `prepareClickScreenshot`), avant que la page
   * n'ait eu la moindre chance de réagir au clic qui suit. Consommée par la prochaine action
   * 'click' enregistrée (voir `attachPendingBeforeCapture`) ; une seule à la fois car un
   * mousedown/click s'enchaînent toujours avant la paire suivante en usage normal. */
  pendingBeforeCapture?: { promise: Promise<TabCapture>; pageX: number; pageY: number; timestamp: number } | null;
}

/** Map des états d'enregistrement par tabId */
const recordingStates = new Map<number, RecordingState>();

/** Onglet actif actuel (pour la compatibilité avec le stockage unique) */
let activeTabId: number | null = null;

/**
 * Récupère ou crée l'état d'enregistrement pour un onglet
 */
function getState(tabId?: number): RecordingState {
  const id = tabId ?? activeTabId ?? 0;
  if (!recordingStates.has(id)) {
    recordingStates.set(id, {
      lastAction: null,
      last: Date.now(),
      record: null,
      pause: false,
      maxActionsWarningShown: false
    });
  }
  return recordingStates.get(id)!;
}

/**
 * Définit l'onglet actif pour l'enregistrement
 */
export function setActiveTab(tabId: number): void {
  activeTabId = tabId;
}

/**
 * Nettoie l'état d'un onglet fermé
 */
export function cleanupTabState(tabId: number): void {
  recordingStates.delete(tabId);
}

export function initRecord(tabId?: number): void {
  const state = getState(tabId);
  state.record = null;
  state.lastAction = null;
  state.last = Date.now();
  state.maxActionsWarningShown = false; // Reset le flag d'avertissement

  // Annuler toute sauvegarde en attente de l'ancien record
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  pendingSaveRecord = null;
}

/**
 * Vérifie si on peut ajouter une nouvelle action (limite non atteinte)
 * Retourne true si l'ajout est autorisé
 */
function canAddAction(state: RecordingState): boolean {
  if (!state.record?.actions) {
    return true;
  }

  const actionsCount = state.record.actions.length;

  if (actionsCount >= MAX_ACTIONS_LIMIT) {
    if (!state.maxActionsWarningShown) {
      console.error(`Limite de ${MAX_ACTIONS_LIMIT} actions atteinte. Les nouvelles actions sont ignorées. Sauvegardez et recommencez un nouvel enregistrement.`);
      state.maxActionsWarningShown = true;

      // Notifier l'UI
      chrome.runtime.sendMessage(
        {
          action: 'UI_RECORD_LIMIT_REACHED',
          value: MAX_ACTIONS_LIMIT
        },
        () => {
          if (chrome.runtime.lastError) {
            // Ignorer
          }
        }
      );
    }
    return false;
  }

  return true;
}

export function setPause(val: boolean, tabId?: number): void {
  const state = getState(tabId);
  state.pause = val;
}

export function addRecordByImage(userAction: IUserAction, tabId: number, frameId: number): Promise<void> {
  return addTargetedAction(userAction, tabId, frameId, ActionType.RECORD_BY_IMAGE);
}

export function addRecordByLabel(userAction: IUserAction, tabId: number, frameId: number): Promise<void> {
  return addTargetedAction(userAction, tabId, frameId, ActionType.RECORD_BY_LABEL);
}

/**
 * Enregistre une action qui désigne son élément autrement que par ses coordonnées
 * (par l'image ou par le libellé) : seul le type d'action les distingue.
 */
async function addTargetedAction(userAction: IUserAction, tabId: number, frameId: number, actionType: ActionType): Promise<void> {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  // Vérifier la limite d'actions
  if (!canAddAction(state)) {
    return;
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  if (userAction.frame && userAction.frame.frameIndex !== undefined) {
    // on est dans le cas devtools
    const action = new Action(delay, actionType, userAction);
    action.timestamp = userAction.eventTimestamp ?? now;
    state.record.actions.push(action);
    state.last = now;
    state.record.last = state.last;
    saveUiRecordToLocalStorage(state.record);
  } else {
    try {
      const iframe = await getSrcFromFrameId(tabId, frameId);
      userAction.frame = iframe;
    } catch {
      // Frame non trouvée, on continue avec un frame par défaut
      userAction.frame = { src: '', frameId: 0 };
    }
    const action = new Action(delay, actionType, userAction);
    action.timestamp = userAction.eventTimestamp ?? now;
    state.record.actions.push(action);
    state.last = now;
    state.record.last = state.last;
    saveUiRecordToLocalStorage(state.record);
  }
}

/** Intervalle minimal entre deux captures d'écran (ms), tous déclencheurs confondus
 * (navigation, appel HTTP stabilisé) : masquer/réafficher le panneau pour chaque capture est
 * lui-même une mutation DOM observée par la détection de stabilisation HTTP (voir
 * httpmanager.ts) — sans ce plafond, une page qui enchaîne beaucoup d'appels HTTP peut
 * déclencher une rafale de captures qui se relancent mutuellement et geler la page. */
const CAPTURE_MIN_INTERVAL_MS = 800;

interface TabCapture {
  imgData?: string;
  scrollX?: number;
  scrollY?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * `chrome.tabs.captureVisibleTab` renvoie un PNG à la résolution native de l'écran (souvent
 * 2x/3x sur un écran retina) : stocké tel quel, un seul screenshot peut peser plusieurs Mo en
 * base64. `JSON.stringify` + la compression LZ-string de plusieurs Mo dans le service worker
 * sont lentes, et un redémarrage du service worker (normal en Manifest V3) en plein milieu peut
 * faire perdre la sauvegarde silencieusement. On redimensionne et recompresse en WebP dès la
 * capture, avant tout stockage — pas seulement à la génération du rapport.
 */
/** Filet de sécurité : si une étape (createImageBitmap, convertToBlob...) ne se termine
 * jamais — ex. le service worker est interrompu en plein milieu, comportement normal en
 * Manifest V3 — l'appelant ne doit jamais rester bloqué indéfiniment. */
const OPTIMIZE_SCREENSHOT_TIMEOUT_MS = 3000;

async function optimizeScreenshotRaw(dataUrl: string, maxWidthPx: number): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const ratio = Math.min(1, maxWidthPx / bitmap.width);
  const targetWidth = Math.max(1, Math.round(bitmap.width * ratio));
  const targetHeight = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrl;
  }
  // Le lissage par défaut ('low') rend le texte illisible sur une réduction 2x/3x (écran retina).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  // WebP plutôt que JPEG : plus compact à qualité égale et sans artefacts autour du texte.
  // Cette capture est la source des images du rapport, autant éviter une perte précoce.
  const outBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
  return blobToDataUrl(outBlob);
}

async function optimizeScreenshot(dataUrl: string, maxWidthPx = 1280): Promise<string> {
  try {
    return await Promise.race([optimizeScreenshotRaw(dataUrl, maxWidthPx), new Promise<string>((resolve) => setTimeout(() => resolve(dataUrl), OPTIMIZE_SCREENSHOT_TIMEOUT_MS))]);
  } catch (e) {
    console.warn('[Tuello] Optimisation du screenshot échouée, conservation de l’image brute :', e);
    return dataUrl; // repli : image d'origine, mieux vaut une capture lourde qu'aucune
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    // Par blocs : `String.fromCharCode(...bytes)` sur un trop grand tableau dépasse la limite
    // d'arguments d'un appel de fonction.
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${blob.type};base64,${btoa(binary)}`;
  });
}

/**
 * Capture une miniature de l'onglet (navigation, ou appel HTTP stabilisé). Un échec ne doit
 * jamais empêcher l'ajout/la mise à jour de l'entrée elle-même. Attend la réponse du `HIDE`
 * (qui renvoie aussi la géométrie de défilement/viewport, nécessaire pour replacer un repère
 * de clic sur l'image) avant de capturer, plutôt que de les lancer en parallèle.
 */
/** Si la page navigue juste entre l'envoi de HIDE et sa réponse, le content script d'origine
 * peut être détruit sans jamais répondre : sans ce filet, la capture resterait bloquée
 * indéfiniment. Au-delà, on tente quand même la capture (sans géométrie pour le repère). */
const HIDE_RESPONSE_TIMEOUT_MS = 1000;

/** `chrome.tabs.captureVisibleTab` peut échouer pour une raison transitoire (limite de
 * fréquence Chrome, onglet momentanément pas au premier plan...) — souvent justement au moment
 * d'une erreur applicative, là où la capture a le plus de valeur. Une seule tentative de
 * rattrapage après un court délai plutôt que d'abandonner immédiatement. */
const CAPTURE_RETRY_DELAY_MS = 400;

function captureVisibleTabWithRetry(attempt = 1): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: 'png' }, (imgData) => {
      if ((chrome.runtime.lastError || !imgData) && attempt === 1) {
        setTimeout(() => resolve(captureVisibleTabWithRetry(2)), CAPTURE_RETRY_DELAY_MS);
        return;
      }
      if (chrome.runtime.lastError || !imgData) {
        console.warn('[Tuello] captureVisibleTab a échoué après rattrapage :', chrome.runtime.lastError?.message);
        resolve(undefined);
        return;
      }
      resolve(imgData);
    });
  });
}

function captureTabThumbnail(tabId: number): Promise<TabCapture> {
  return new Promise((resolve) => {
    let settled = false;

    const proceedToCapture = (geometry?: Partial<TabCapture>) => {
      if (settled) return;
      settled = true;
      captureVisibleTabWithRetry().then(async (rawImgData) => {
        chrome.tabs.sendMessage(tabId, { action: 'SHOW' }, { frameId: 0 }, () => {});
        if (!rawImgData) {
          resolve({});
          return;
        }
        const imgData = await optimizeScreenshot(rawImgData);
        resolve({ imgData, ...geometry });
      });
    };

    const hideTimeout = setTimeout(() => proceedToCapture(), HIDE_RESPONSE_TIMEOUT_MS);
    chrome.tabs.sendMessage(tabId, { action: 'HIDE' }, { frameId: 0 }, (geometry) => {
      clearTimeout(hideTimeout);
      proceedToCapture(geometry);
    });
  });
}

/**
 * @param append true pour une navigation faite en cours d'enregistrement (favori,
 * URL saisie, précédent/suivant, rechargement) : elle prend sa place à la suite des
 * actions déjà enregistrées. false pour la navigation initiale, qui ouvre le scénario.
 */
export async function addNavigate(userAction: IUserAction, tabId: number, frameId: number, append = false): Promise<void> {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  // Vérifier la limite d'actions
  if (!canAddAction(state)) {
    return;
  }

  // Une redirection enchaîne plusieurs navigations vers la même page : une seule
  // action a du sens au rejeu. Un rechargement (F5) vise par définition la page
  // courante : lui, reste une action à part entière.
  const lastRecorded = state.record.actions[state.record.actions.length - 1];
  const isReload = userAction.type === 'reload';
  if (append && !isReload && lastRecorded?.actionType === ActionType.NAVIGATE && lastRecorded.userAction?.hrefLocation === userAction.hrefLocation) {
    return;
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  try {
    const iframe = await getSrcFromFrameId(tabId, frameId);
    userAction.frame = iframe;
  } catch {
    // Frame non trouvée, on continue avec un frame par défaut
    userAction.frame = { src: '', frameId: 0 };
  }

  let thumbnail: string | undefined;
  if (now - (state.lastCaptureAt ?? 0) >= CAPTURE_MIN_INTERVAL_MS) {
    thumbnail = (await captureTabThumbnail(tabId)).imgData;
    state.lastCaptureAt = now;
  }

  const action = new Action(delay, ActionType.NAVIGATE, userAction, thumbnail);
  action.timestamp = now;
  if (append || state.record.actions.length === 0) {
    state.record.actions.push(action);
    // La page a changé : un scroll ou une saisie qui suit ne doit pas être fusionné
    // avec celui d'avant la navigation.
    if (append) {
      state.lastAction = action;
    }
  } else {
    state.record.actions.unshift(action);
  }
  state.last = now;
  state.record.last = state.last;
  saveUiRecordToLocalStorage(state.record);
}

/** Durée de vie max d'une capture "avant" en attente (voir `prepareClickScreenshot`) avant
 * d'être jugée trop ancienne pour être fiable : au-delà, mieux vaut ne pas l'attacher plutôt
 * que de montrer un écran qui n'a plus de rapport avec le clic qui a suivi (ex. mousedown non
 * suivi d'un click — sélection de texte, glisser-déposer). */
const PENDING_BEFORE_CAPTURE_MAX_AGE_MS = 2000;

/**
 * Démarre la capture "avant" dès le `mousedown`, avant que le `click` qui suit n'ait pu
 * déclencher la moindre réaction de la page (changement de DOM, navigation...). Attacher la
 * capture au moment du `click` était trop tard : notre listener de clic (même en phase capture)
 * s'exécute de façon synchrone dans le même tour de boucle d'événements que les gestionnaires de
 * la page, mais `chrome.tabs.captureVisibleTab` est asynchrone — par le temps qu'il s'exécute
 * réellement, la page a déjà fini de réagir. Démarrer le round-trip HIDE/capture/SHOW dès le
 * `mousedown` (avant toute réaction de la page) est la seule façon d'obtenir une vraie image
 * "d'avant". Le résultat est consommé par `attachPendingBeforeCapture` une fois l'action
 * 'click' correspondante créée, quel que soit l'ordre d'arrivée des deux.
 */
export function prepareClickScreenshot(data: { x: number; y: number }, tabId?: number): void {
  if (!tabId || typeof data?.x !== 'number' || typeof data?.y !== 'number') {
    return;
  }

  const state = getState(tabId);

  const now = Date.now();
  if (now - (state.lastCaptureAt ?? 0) < CAPTURE_MIN_INTERVAL_MS) {
    return;
  }
  state.lastCaptureAt = now;
  state.pendingBeforeCapture = {
    promise: captureTabThumbnail(tabId),
    pageX: data.x,
    pageY: data.y,
    timestamp: now
  };
}

/**
 * Attache la capture "avant" préparée au `mousedown` (voir `prepareClickScreenshot`) à l'action
 * 'click' qui vient d'être enregistrée. Fire-and-forget : ne doit jamais retarder
 * l'enregistrement de l'action elle-même.
 */
async function attachPendingBeforeCapture(action: Action, state: RecordingState): Promise<void> {
  const pending = state.pendingBeforeCapture;
  if (!pending) {
    return;
  }
  // Consommée immédiatement : un click sans mousedown préalable (ex. activation clavier) ne
  // doit pas récupérer par erreur la capture d'un clic précédent.
  state.pendingBeforeCapture = null;
  if (Date.now() - pending.timestamp > PENDING_BEFORE_CAPTURE_MAX_AGE_MS) {
    return;
  }

  const capture = await pending.promise;
  if (!capture.imgData) {
    return;
  }

  action.data = capture.imgData;
  if (capture.scrollX !== undefined && capture.scrollY !== undefined && capture.viewportWidth !== undefined && capture.viewportHeight !== undefined) {
    action.screenshotMarker = {
      pageX: pending.pageX,
      pageY: pending.pageY,
      scrollX: capture.scrollX,
      scrollY: capture.scrollY,
      viewportWidth: capture.viewportWidth,
      viewportHeight: capture.viewportHeight
    };
  }
  saveUiRecordToLocalStorage(state.record!);
}

export async function addUserAction(userAction: IUserAction, tabId: number, frameId: number): Promise<void> {
  const state = getState(tabId);

  if (state.pause) {
    return;
  }

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
    state.lastAction = null;
  }

  // Vérifier la limite d'actions
  if (!canAddAction(state)) {
    return;
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;
  const action = new Action(delay, ActionType.EVENT, userAction);
  // Horodatage pris dans la page : `now` est celui de la réception par le service worker,
  // qui arrive souvent APRÈS le départ de la requête HTTP déclenchée par ce même clic
  // (round-trip de messagerie, capture "avant" en cours de compression...).
  action.timestamp = userAction.eventTimestamp ?? now;

  // Résoudre le frame de manière synchrone avant de traiter l'action
  if (!(userAction.frame && userAction.frame.frameIndex !== undefined)) {
    try {
      const iframe = await getSrcFromFrameId(tabId, frameId);
      userAction.frame = iframe;
    } catch {
      // Frame non trouvée, on continue avec frameId 0
      userAction.frame = { src: '', frameId: 0 };
    }
  }

  const compareFrameId = userAction.frame?.frameId ?? 0;

  /**
   * Traite une action selon son type avec déduplication
   */
  switch (userAction.type) {
    case 'scroll':
      if (state.lastAction && state.lastAction.userAction && state.lastAction.userAction.type === userAction.type && state.lastAction.userAction.frame?.frameId === compareFrameId) {
        state.lastAction.userAction.scrollX = userAction.scrollX;
        state.lastAction.userAction.scrollY = userAction.scrollY;
        state.lastAction.delay = state.lastAction.delay + delay;
      } else {
        state.record.actions.push(action);
        state.lastAction = action;
      }
      break;
    case 'input':
      if (state.lastAction && state.lastAction.userAction && state.lastAction.userAction.type === userAction.type && state.lastAction.userAction.frame?.frameId === compareFrameId) {
        state.lastAction.userAction.value = userAction.value;
      } else {
        state.record.actions.push(action);
        state.lastAction = action;
      }
      break;
    case 'resize':
      // Utiliser une promesse pour gérer le callback de chrome.windows.getCurrent
      await new Promise<void>((resolve) => {
        chrome.windows.getCurrent((windowInfos) => {
          const htmlCoordinates = {
            width: windowInfos.width,
            height: windowInfos.height,
            top: windowInfos.top,
            left: windowInfos.left
          };
          if (state.lastAction && state.lastAction.userAction && state.lastAction.userAction.type === userAction.type && state.lastAction.userAction.frame?.frameId === compareFrameId) {
            state.lastAction.userAction.htmlCoordinates = htmlCoordinates;
          } else {
            action.userAction.htmlCoordinates = htmlCoordinates;
            state.record!.actions.push(action);
            state.lastAction = action;
          }
          resolve();
        });
      });
      break;
    default:
      state.record.actions.push(action);
      state.lastAction = action;
      break;
  }

  state.last = now;
  state.record.last = state.last;
  saveUiRecordToLocalStorage(state.record);

  if (userAction.type === 'click') {
    // Fire-and-forget : ne doit pas retarder le retour de addUserAction.
    attachPendingBeforeCapture(action, state);
  }
}

export function addScreenShot(tabId: number, isPopupVisible: boolean): Promise<boolean> {
  const state = getState(tabId);

  return new Promise((resolve) => {
    if (!state.record) {
      state.record = new Record();
      state.record.actions = [];
      state.lastAction = null;
    }

    // Vérifier la limite d'actions
    if (!canAddAction(state)) {
      resolve(false);
      return;
    }

    if (isPopupVisible) {
      chrome.tabs.sendMessage(
        tabId,
        {
          action: 'HIDE'
        },
        {
          frameId: 0
        },
        () => {}
      );
    }
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: 'png' }, (imgData) => {
      if (chrome.runtime.lastError || !imgData) {
        console.warn('Erreur capture screenshot:', chrome.runtime.lastError?.message);
        resolve(false);
        return;
      }

      const now = Date.now();
      const delay = isNaN(now - state.last) ? 0 : now - state.last;

      const action = new Action(delay, ActionType.SCREENSHOT, null, imgData);
      action.timestamp = now;

      state.record!.actions.push(action);
      state.lastAction = action;
      state.last = now;
      if (isPopupVisible) {
        chrome.tabs.sendMessage(
          tabId,
          {
            action: 'SHOW'
          },
          {
            frameId: 0
          },
          () => {}
        );
      }
      saveUiRecordToLocalStorage(state.record!);
      resolve(true);
    });
  });
}

export function addComment(comment: string, tabId?: number): void {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  // Vérifier la limite d'actions
  if (!canAddAction(state)) {
    return;
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  const action = new Action(delay, ActionType.COMMENT, null, comment);
  action.timestamp = now;

  state.record.actions.push(action);
  state.lastAction = action;
  state.last = now;
  saveUiRecordToLocalStorage(state.record);
}

/**
 * Attache une capture d'écran à une requête HTTP déjà enregistrée, une fois le DOM stabilisé
 * (voir la détection dans httpmanager.ts : compteur de requêtes en vol + délai de rendu,
 * message HTTP_SETTLED). L'entrée a pu être supprimée entre-temps côté panneau : on abandonne
 * alors en silence. Pas de repère de clic ici : la page a déjà changé depuis le clic qui a
 * potentiellement déclenché cet appel (c'est justement le "résultat", pas l'écran du clic) —
 * voir `attachPendingBeforeCapture` pour la capture "avant", qui en porte un.
 */
export async function attachHttpSettledScreenshot(data: { requestId: string }, tabId?: number): Promise<void> {
  if (!tabId) {
    return;
  }
  const state = getState(tabId);
  const http = state.record?.httpRecords?.find((h) => h.requestId === data.requestId);
  if (!http) {
    return;
  }

  // Garde-fou partagé avec les miniatures de navigation : sur une page qui enchaîne beaucoup
  // d'appels HTTP, sans ce plafond chaque capture (masquer/réafficher le panneau) relance le
  // minuteur des autres veilles en attente et peut déclencher une rafale de captures en cascade.
  const now = Date.now();
  if (now - (state.lastCaptureAt ?? 0) < CAPTURE_MIN_INTERVAL_MS) {
    return;
  }
  state.lastCaptureAt = now;

  const capture = await captureTabThumbnail(tabId);
  if (!capture.imgData) {
    return;
  }

  http.screenshot = capture.imgData;
  saveUiRecordToLocalStorage(state.record!);
}

/**
 * La promesse permet à l'appelant d'attendre la (re)création du record avant d'y
 * ajouter une action : cette fonction peut repartir d'un record vide (suppression
 * précédente), ce qui effaçait l'action de navigation initiale ajoutée en parallèle.
 */
export function addRecordWindowSize(windowSize: WindowSize, tabId?: number): Promise<void> {
  const state = getState(tabId);

  // Vérifier le flag dans le storage (async mais non bloquant pour l'UI)
  return new Promise<void>((resolve) => {
    chrome.storage.local.get(['uiRecordDeleted'], (result) => {
      // Si le flag est présent (mémoire OU storage), forcer un nouveau record
      if (result.uiRecordDeleted || recordDeletedFlag) {
        state.record = null;
        state.lastAction = null;
        recordDeletedFlag = false;
        // Supprimer le flag du storage
        chrome.storage.local.remove(['uiRecordDeleted']);
      }

      if (!state.record) {
        state.record = new Record(windowSize);
        state.record.actions = [];
        state.lastAction = null;
      } else {
        state.record.windowSize = windowSize;
      }

      // Sauvegarder et notifier Angular
      saveUiRecordToLocalStorage(state.record);
      resolve();
    });
  });
}

/**
 * Remplace le record gardé en mémoire par celui édité dans le panneau Angular.
 * Sans ça, la copie mémoire du background (obsolète) était réécrite dans le storage
 * à l'action suivante et les modifications faites dans le panneau (suppression,
 * réordonnancement, délais, import) étaient perdues.
 */
export function replaceRecord(record: Record | null, tabId?: number): void {
  const state = getState(tabId);

  if (!record) {
    state.record = null;
    state.lastAction = null;
    return;
  }

  const updated = new Record(record.windowSize);
  updated.actions = record.actions ?? [];
  updated.httpRecords = record.httpRecords;
  updated.consoleLogs = record.consoleLogs;
  updated.last = record.last ?? Date.now();

  state.record = updated;
  state.lastAction = updated.actions.length ? updated.actions[updated.actions.length - 1] : null;
}

export function addHttpUserAction(data: HttpReturn, tabId?: number): void {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.lastAction = null;
  }
  if (!state.record.httpRecords) {
    state.record.httpRecords = [];
  }

  state.record.httpRecords.push(data);
  // Dédoublonner par requestId (unique par appel réel), pas par URL seule : un même endpoint
  // appelé plusieurs fois (recherche répétée, polling...) doit rester un appel par entrée,
  // sinon un appel en cours de stabilisation (capture d'écran différée, voir
  // attachHttpSettledScreenshot) perd silencieusement son entrée dès l'appel suivant sur la
  // même URL. Repli sur `key` pour les entrées plus anciennes, enregistrées avant ce champ.
  state.record.httpRecords = removeDuplicateEntries(state.record.httpRecords, (item: HttpReturn) => item.requestId ?? item.key);

  // Trier par horodatage de DÉPART (décroissant, le plus récent en premier - lu tel quel par
  // le panneau Spy et par le rapport HTML). Un simple ajout en tête (ordre d'arrivée des
  // messages RECORD_HTTP, donc ordre de FIN des requêtes) plaçait mal les appels concurrents :
  // une requête lente démarrée en premier mais qui répond après une requête rapide démarrée
  // plus tard apparaissait après elle au lieu d'avant.
  state.record.httpRecords.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  saveUiRecordToLocalStorage(state.record);
}

/** Plafond de logs conservés par session : borne la taille du rapport sur une page très verbeuse. */
const MAX_CONSOLE_LOGS = 300;

export function addConsoleLogs(entries: ConsoleLogEntry[], tabId?: number): void {
  if (!Array.isArray(entries) || !entries.length) {
    return;
  }
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.lastAction = null;
  }
  if (!state.record.consoleLogs) {
    state.record.consoleLogs = [];
  }

  state.record.consoleLogs.push(...entries);
  if (state.record.consoleLogs.length > MAX_CONSOLE_LOGS) {
    state.record.consoleLogs = state.record.consoleLogs.slice(-MAX_CONSOLE_LOGS);
  }

  saveUiRecordToLocalStorage(state.record);
}

export function loadRecordFromStorage(tabId?: number): Promise<void> {
  const state = getState(tabId);

  // Ne pas charger si le record vient d'être supprimé (flag en mémoire)
  if (recordDeletedFlag) {
    state.last = Date.now();
    return Promise.resolve();
  }

  // La promesse permet à l'appelant d'attendre le chargement avant de toucher au
  // record (sinon un "reprendre l'enregistrement" créait un record vide en parallèle).
  return new Promise<void>((resolve) => {
    // Vérifier aussi le flag persisté dans le storage (survit au redémarrage du service worker)
    chrome.storage.local.get(['uiRecordDeleted'], (result) => {
      if (result.uiRecordDeleted) {
        state.last = Date.now();
        // Supprimer le flag maintenant qu'on l'a lu
        chrome.storage.local.remove(['uiRecordDeleted']);
        resolve();
        return;
      }

      loadCompressed<Record>('uiRecord')
        .then((data) => {
          // Vérifier à nouveau le flag après le chargement asynchrone
          if (recordDeletedFlag) {
            state.last = Date.now();
            return;
          }

          if (data) {
            if (!state.record) {
              state.record = new Record(data.windowSize);
              state.record.actions = data.actions ?? [];
              state.record.httpRecords = data.httpRecords;
              state.record.consoleLogs = data.consoleLogs;
              state.lastAction = state.record.actions.length ? state.record.actions[state.record.actions.length - 1] : null;
              state.last = data.last ?? Date.now();
            }
          } else {
            state.last = Date.now();
          }
        })
        .catch(() => {
          state.last = Date.now();
        })
        .then(() => resolve());
    });
  });
}

export function deleteRecord(tabId?: number): Promise<void> {
  return new Promise((resolve) => {
    const state = getState(tabId);
    state.record = null;
    state.lastAction = null;

    // Annuler toute sauvegarde en attente pour éviter de restaurer l'ancien record
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    pendingSaveRecord = null;

    // Reset le flag d'avertissement de limite
    state.maxActionsWarningShown = false;

    // Marquer que le record a été supprimé (flag en mémoire + storage pour persister au redémarrage du service worker)
    recordDeletedFlag = true;

    // Supprimer le record ET marquer la suppression dans le storage
    chrome.storage.local.remove(['uiRecord'], () => {
      chrome.storage.local.set({ uiRecordDeleted: true }, () => {
        resolve();
      });
    });
  });
}

/**
 * URLs considérées comme "cross-origin" ou restreintes
 * Ces URLs ne sont pas fiables pour identifier une iframe
 */
const CROSS_ORIGIN_URL_PATTERNS = ['about:blank', 'about:srcdoc', 'chrome-extension://', 'chrome://', 'data:'];

/**
 * Vérifie si une URL est une URL cross-origin/restreinte
 */
function isCrossOriginUrl(url: string): boolean {
  if (!url) return true;
  return CROSS_ORIGIN_URL_PATTERNS.some((pattern) => url.startsWith(pattern));
}

export function getFrameIdFromSrc(tabId: number, src: string): Promise<IFrame> {
  return new Promise((resolve, reject) => {
    if (!src || isCrossOriginUrl(src)) {
      // Pour les URLs cross-origin, on ne peut pas faire de correspondance fiable
      reject('URL cross-origin ou vide');
      return;
    }

    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      if (chrome.runtime.lastError) {
        reject(`Erreur webNavigation: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!frames || frames.length === 0) {
        reject('Aucun frame trouvé');
        return;
      }

      // Recherche exacte d'abord
      for (const frame of frames) {
        if (frame.url === src) {
          resolve({
            src: frame.url,
            frameId: frame.frameId
          });
          return;
        }
      }

      // Recherche partielle (même origine + chemin)
      try {
        const srcUrl = new URL(src);
        for (const frame of frames) {
          if (frame.url && !isCrossOriginUrl(frame.url)) {
            try {
              const frameUrl = new URL(frame.url);
              if (frameUrl.origin === srcUrl.origin && frameUrl.pathname === srcUrl.pathname) {
                resolve({
                  src: frame.url,
                  frameId: frame.frameId
                });
                return;
              }
            } catch {
              // URL invalide, ignorer
            }
          }
        }
      } catch {
        // URL source invalide
      }

      reject('Frame non trouvé');
    });
  });
}

export function getSrcFromFrameId(tabId: number, frameId: number): Promise<IFrame> {
  return new Promise((resolve, reject) => {
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      if (chrome.runtime.lastError) {
        reject(`Erreur webNavigation: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!frames || frames.length === 0) {
        reject('Aucun frame trouvé');
        return;
      }

      for (const frame of frames) {
        if (frame.frameId === frameId) {
          // Avertir si c'est une URL cross-origin
          if (isCrossOriginUrl(frame.url)) {
            console.warn(`Frame ${frameId} a une URL cross-origin: ${frame.url}. Le replay peut être imprécis.`);
          }
          resolve({
            src: frame.url,
            frameId: frame.frameId
          });
          return;
        }
      }
      reject('Frame non trouvé');
    });
  });
}

/** Timer pour le debounce de sauvegarde */
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Record en attente de sauvegarde */
let pendingSaveRecord: Record | null = null;

/** Flag pour indiquer qu'une suppression est en cours ou vient d'être effectuée */
let recordDeletedFlag = false;

// Charger le flag depuis le storage au démarrage du service worker (survit au redémarrage)
chrome.storage.local.get(['uiRecordDeleted'], (result) => {
  if (result.uiRecordDeleted) {
    recordDeletedFlag = true;
  }
});

/**
 * Sauvegarde le record avec debounce pour éviter les écritures trop fréquentes
 */
function saveUiRecordToLocalStorage(record: Record): void {
  // Un nouvel enregistrement existe : le marqueur de suppression n'a plus lieu d'être.
  // Sans ça il restait actif et bloquait le rechargement du record au redémarrage du
  // service worker, faisant perdre tout ce qui avait été enregistré après la suppression.
  if (recordDeletedFlag) {
    recordDeletedFlag = false;
    chrome.storage.local.remove(['uiRecordDeleted']);
  }

  pendingSaveRecord = record;

  // Annuler le timer précédent si existant
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  // Envoyer immédiatement le message UI (pas de debounce pour la réactivité)
  chrome.runtime.sendMessage(
    {
      action: 'UI_RECORD_CHANGED',
      value: record
    },
    () => {
      // Ignorer les erreurs si aucun listener n'est présent
      if (chrome.runtime.lastError) {
        // Silencieux - pas de listener Angular actif
      }
    }
  );

  // Debounce la sauvegarde dans le storage
  saveDebounceTimer = setTimeout(() => {
    if (pendingSaveRecord) {
      // Avertir si trop d'actions
      if (pendingSaveRecord.actions && pendingSaveRecord.actions.length > MAX_ACTIONS_WARNING) {
        console.warn(`Attention: ${pendingSaveRecord.actions.length} actions enregistrées. Considérez sauvegarder et recommencer.`);
      }

      saveCompressed('uiRecord', pendingSaveRecord).catch((err) => {
        console.error('[Tuello] Erreur sauvegarde uiRecord:', err);
      });
      pendingSaveRecord = null;
    }
    saveDebounceTimer = null;
  }, SAVE_DEBOUNCE_DELAY_MS);
}

/**
 * Force la sauvegarde immédiate (utile avant fermeture de l'onglet)
 */
export function flushPendingSave(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  if (pendingSaveRecord) {
    saveCompressed('uiRecord', pendingSaveRecord).catch((err) => {
      console.error('Erreur sauvegarde uiRecord:', err);
    });
    pendingSaveRecord = null;
  }
}
