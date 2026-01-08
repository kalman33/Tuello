import { HttpReturn } from '../../../src/app/recorder-http/models/http.return';
import { Action } from '../../../src/app/spy-http/models/Action';
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

/** Flag pour éviter de spammer les avertissements */
let maxActionsWarningShown = false;

/** État d'enregistrement isolé par onglet */
interface RecordingState {
  lastAction: Action | null;
  last: number;
  record: Record | null;
  pause: boolean;
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
      pause: false
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
  maxActionsWarningShown = false; // Reset le flag d'avertissement

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
    if (!maxActionsWarningShown) {
      console.error(`Limite de ${MAX_ACTIONS_LIMIT} actions atteinte. Les nouvelles actions sont ignorées. Sauvegardez et recommencez un nouvel enregistrement.`);
      maxActionsWarningShown = true;

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

export async function addRecordByImage(userAction: IUserAction, tabId: number, frameId: number): Promise<void> {
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
    const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
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
    const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
    state.record.actions.push(action);
    state.last = now;
    state.record.last = state.last;
    saveUiRecordToLocalStorage(state.record);
  }
}

export async function addNavigate(userAction: IUserAction, tabId: number, frameId: number): Promise<void> {
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

  try {
    const iframe = await getSrcFromFrameId(tabId, frameId);
    userAction.frame = iframe;
  } catch {
    // Frame non trouvée, on continue avec un frame par défaut
    userAction.frame = { src: '', frameId: 0 };
  }

  const action = new Action(delay, ActionType.NAVIGATE, userAction);
  if (state.record.actions.length === 0) {
    state.record.actions.push(action);
  } else {
    state.record.actions.unshift(action);
  }
  state.last = now;
  state.record.last = state.last;
  saveUiRecordToLocalStorage(state.record);
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

  state.record.actions.push(action);
  state.lastAction = action;
  state.last = now;
  saveUiRecordToLocalStorage(state.record);
}

export function addRecordWindowSize(windowSize: WindowSize, tabId?: number): void {
  const state = getState(tabId);

  // Vérifier le flag dans le storage (async mais non bloquant pour l'UI)
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
  });
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

  state.record.httpRecords.unshift(data);
  state.record.httpRecords = removeDuplicateEntries(state.record.httpRecords);

  saveUiRecordToLocalStorage(state.record);
}

export function loadRecordFromStorage(tabId?: number): void {
  const state = getState(tabId);

  // Ne pas charger si le record vient d'être supprimé (flag en mémoire)
  if (recordDeletedFlag) {
    state.last = Date.now();
    return;
  }

  // Vérifier aussi le flag persisté dans le storage (survit au redémarrage du service worker)
  chrome.storage.local.get(['uiRecordDeleted'], (result) => {
    if (result.uiRecordDeleted) {
      state.last = Date.now();
      // Supprimer le flag maintenant qu'on l'a lu
      chrome.storage.local.remove(['uiRecordDeleted']);
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
            state.record.actions = data.actions;
            state.record.httpRecords = data.httpRecords;
            state.lastAction = data.actions && data.actions.length ? data.actions[data.actions.length - 1] : null;
            state.last = data.last;
          }
        } else {
          state.last = Date.now();
        }
      })
      .catch(() => {
        state.last = Date.now();
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
    maxActionsWarningShown = false;

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
        console.error('Erreur sauvegarde uiRecord:', err);
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
