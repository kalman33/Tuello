import { IUserAction } from '../../src/app/spy-http/models/UserAction';
import { launchUIRecorderHandler } from './uirecorder';
import * as lightboxImg from './utils/imageviewer';
import * as jsonViewer from './utils/jsonViewer';
import { addMouseCoordinates, removeMouseCoordinates } from './utils/mouse';
import { recordHttpListener, flushPendingRecords } from './utils/recordHttpListener';
import { activateSearchElements, desactivateSearchElements, initSearchElementsSync } from './utils/searchElements';
import { addTagsPanel, deleteTagsPanel, initTagsHandler } from './utils/tags';
import { activateRecordTracks, desactivateRecordTracks } from './utils/tracker';
import { run } from './utils/uiplayer';
import { hideComment, showComment } from './utils/commentBanner';
import { displayEffect, setVerboseLogging } from './utils/utils';
import { loadCompressedMultiple } from './utils/compression';
import { IFRAME_OFFSET_PX, IFRAME_WIDTH_PX } from './utils/constants';

let show = false;
let clickedElement: string;
const prefix: string = '[ TUELLO ]';
let mousedownListenerAdded = false;
let dockedLeft = false;
// undefined tant que la lecture du storage n'a pas abouti (démarrage de la page)
let verboseMode: boolean | undefined;

/**
 * Applique la position du dock (gauche ou droite)
 */
function applyDockPosition(iframe: HTMLIFrameElement, isVisible: boolean) {
  if (dockedLeft) {
    iframe.style.setProperty('left', '0', 'important');
    iframe.style.setProperty('right', 'auto', 'important');
    iframe.style.setProperty('transform', isVisible ? 'translateX(0)' : `translateX(-${IFRAME_OFFSET_PX}px)`, 'important');
  } else {
    iframe.style.setProperty('right', '0', 'important');
    iframe.style.setProperty('left', 'auto', 'important');
    iframe.style.setProperty('transform', isVisible ? 'translateX(0)' : `translateX(${IFRAME_OFFSET_PX}px)`, 'important');
  }
}

/**
 * Handler pour capturer l'élément cliqué (utilisé pour JSON Viewer)
 */
function handleMousedown(event: MouseEvent): void {
  clickedElement = (event.target as HTMLElement)?.innerHTML || '';
}

/**
 * Ajoute le listener mousedown si pas déjà ajouté
 */
function addMousedownListener(): void {
  if (!mousedownListenerAdded) {
    document.addEventListener('mousedown', handleMousedown, true);
    mousedownListenerAdded = true;
  }
}

/**
 * Supprime le listener mousedown
 */
function removeMousedownListener(): void {
  if (mousedownListenerAdded) {
    document.removeEventListener('mousedown', handleMousedown, true);
    mousedownListenerAdded = false;
  }
}

/**
 * Valide la structure des données tuelloRecords
 */
function validateTuelloRecords(data: unknown): data is { tuelloRecords: unknown[]; deepMockLevel?: number } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // tuelloRecords doit être un tableau
  if (!Array.isArray(obj.tuelloRecords)) {
    return false;
  }

  // deepMockLevel doit être un nombre ou undefined
  if (obj.deepMockLevel !== undefined && typeof obj.deepMockLevel !== 'number') {
    return false;
  }

  return true;
}

/**
 * Parse et valide les données JSON de manière sécurisée
 */
function safeParseJson<T>(jsonString: string, validator?: (data: unknown) => data is T): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (validator && !validator(parsed)) {
      console.warn('Tuello: Données JSON invalides, structure incorrecte');
      return null;
    }
    return parsed as T;
  } catch (error) {
    console.warn('Tuello: Erreur parsing JSON:', error);
    return null;
  }
}

// Récupération des données du localStorage
// Si httpMock était actif lors de la dernière session, on envoie MOCK_HTTP_ACTIVATED
// immédiatement (synchrone) pour éviter la race condition avec les requêtes XHR au démarrage.
try {
  const jsonData = localStorage.getItem('TUELLO_RECORDS');
  const httpMockActive = localStorage.getItem('TUELLO_HTTP_MOCK') === 'true';
  if (jsonData && httpMockActive) {
    const parsed = safeParseJson(jsonData, validateTuelloRecords);
    if (parsed) {
      window.postMessage(
        {
          ...parsed,
          type: 'MOCK_HTTP_ACTIVATED',
          value: true
        },
        '*'
      );
    }
  } else if (jsonData) {
    const parsed = safeParseJson(jsonData, validateTuelloRecords);
    if (parsed) {
      window.postMessage(
        {
          ...parsed,
          type: 'MOCK_HTTP_TUELLO_RECORDS',
          value: true
        },
        '*'
      );
    }
  }
} catch (error) {
  // Ignorer les erreurs localStorage (peut échouer en contexte cross-origin)
}

/**
 * Met à jour le cache localStorage utilisé au démarrage de la page pour appliquer
 * les mocks avant la lecture (asynchrone) de chrome.storage.
 * Doit être rafraîchi à chaque changement de mocks, sinon un rechargement rejoue
 * brièvement des mocks supprimés.
 */
function cacheTuelloRecords(tuelloRecords: unknown, deepMockLevel: number): void {
  try {
    const json = JSON.stringify({ tuelloRecords, deepMockLevel });
    // Écriture synchrone et coûteuse (tous les mocks, dans chaque frame, à chaque
    // chargement) : inutile quand le cache est déjà à jour, le cas courant.
    if (localStorage.getItem('TUELLO_RECORDS') === json) return;
    localStorage.setItem('TUELLO_RECORDS', json);
  } catch (error) {
    // Ignorer les erreurs localStorage (peut échouer si quota dépassé ou contexte cross-origin)
  }
}

type MockRecordsData = { tuelloRecords?: unknown; deepMockLevel?: number };

// Lecture des mocks au chargement de la page, réutilisée par la première activation :
// chaque lecture coûte une décompression LZ de tous les mocks, dans chaque frame.
let bootRecordsPromise: Promise<MockRecordsData> | null = loadCompressedMultiple<MockRecordsData>(['tuelloRecords', 'deepMockLevel']);

/** Mocks de la lecture de démarrage (une seule fois), puis relus depuis le storage */
function loadMockRecords(): Promise<MockRecordsData> {
  const promise = bootRecordsPromise ?? loadCompressedMultiple<MockRecordsData>(['tuelloRecords', 'deepMockLevel']);
  bootRecordsPromise = null;
  return promise;
}

bootRecordsPromise
  .then((result) => {
    if (result.tuelloRecords && Array.isArray(result.tuelloRecords)) {
      cacheTuelloRecords(result.tuelloRecords, result.deepMockLevel || 0);
      window.postMessage(
        {
          type: 'MOCK_HTTP_TUELLO_RECORDS',
          value: true,
          tuelloRecords: result.tuelloRecords,
          deepMockLevel: result.deepMockLevel || 0
        },
        '*'
      );
    }
  })
  .catch(() => {
    // Ignorer les erreurs de décompression
  });

// Ajouter le listener mousedown au chargement
addMousedownListener();

/**
 * Mode verbeux gardé en mémoire et transmis à httpmanager.js : auparavant chaque log
 * déclenchait une lecture de chrome.storage, et httpmanager.js postait ses logs même
 * mode verbeux coupé.
 */
function applyVerboseMode(value: unknown): void {
  verboseMode = !!value;
  setVerboseLogging(verboseMode);
  window.postMessage({ type: 'TUELLO_VERBOSE_MODE', value: verboseMode }, '*');
}
chrome.storage.local.get(['verboseMode'], (results) => applyVerboseMode(results.verboseMode));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['verboseMode']) {
    applyVerboseMode(changes['verboseMode'].newValue);
  }
});

// La recherche d'éléments suit ses réglages via chrome.storage.onChanged (tous les onglets)
initSearchElementsSync();

document.onreadystatechange = () => {
  if (document.readyState === 'interactive') {
    init();
  }
};

let scriptInjected = false;

function init() {
  return new Promise((resolve, reject) => {
    if (scriptInjected) {
      // Tuello est déjà injecté
      activate();
      resolve(false);
    } else {
      scriptInjected = true;

      // Import des styles liés au player
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        head.insertAdjacentHTML(
          'beforeend',
          `<style>
          .tuello-background-color {
            background-color: rgb(209, 37, 102) !important;
            transition: background-color 500ms ease-in-out !important;
          }
          .tuello-white-texte {
            color: white !important;
          }
          .tuello-track:hover { 
            cursor: pointer;
          }
          .tuello-circle {
              pointer-events: none;
              width: 30px; height: 30px;
              border-radius: 100%;
              border: 6px solid #D12566;
              position: fixed;
              z-index: 2147483640;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              animation: ring 1.5s infinite;
          }
          
          @keyframes ring {
            0% {
            width: 30px;
            height: 30px;
            opacity: 1;
            }
            100% {
            width: 100px;
            height: 100px;
            opacity: 0;
            }
          }
          #cover-spin {
            position:fixed;
            width:100%;
            left:0;right:0;top:0;bottom:0;
            z-index:9999;
            display:none;
            /* Sans ça, l'overlay récupère le :hover de la page dès qu'il s'affiche et
               l'élément en cours de capture change d'apparence pendant la capture */
            pointer-events:none;
        }
        
        @-webkit-keyframes spin {
          from {-webkit-transform:rotate(0deg);}
          to {-webkit-transform:rotate(360deg);}
        }
        
        @keyframes spin {
          from {transform:rotate(0deg);}
          to {transform:rotate(360deg);}
        }
        
        #cover-spin::after {
            content:'';
            display:block;
            position:absolute;
            right:15px;top:30px;
            width:40px;height:40px;
            border-style:solid;
            border-color:black;
            border-top-color:transparent;
            border-width: 4px;
            border-radius:50%;
            -webkit-animation: spin .8s linear infinite;
            animation: spin .8s linear infinite;
        }
        
        
          </style>`
        );
      }

      // Gestion du UIRecorder
      launchUIRecorderHandler();

      // ajout du spinner
      const spinner = document.createElement('div');
      spinner.id = 'cover-spin';
      if (document && document.body) {
        document.body.prepend(spinner);
      }

      // L'iframe portant l'app n'est créée qu'une fois la page chargée et au repos :
      // voir scheduleIframeCreation
      if (window.self === window.top) {
        iframeLoaded.then(() => resolve(true));
        scheduleIframeCreation();
      }

      activate();
    }
  });
}

/** Délai maximal d'attente du repos de la page (requestIdleCallback) */
const IFRAME_IDLE_TIMEOUT_MS = 3000;
/** Filet de sécurité : page dont l'événement load n'arrive jamais (ressources en streaming...) */
const IFRAME_MAX_DELAY_MS = 5000;

let iframePromise: Promise<HTMLIFrameElement> | null = null;
let resolveIframeLoaded: () => void;
const iframeLoaded = new Promise<void>((resolve) => (resolveIframeLoaded = resolve));

/**
 * Crée l'iframe portant l'app Angular, une seule fois. Résolue dès son insertion dans
 * la page (iframeLoaded signale la fin de son chargement).
 */
function createIframe(): Promise<HTMLIFrameElement> {
  if (!iframePromise) {
    iframePromise = new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.id = 'iframeTuello';
      iframe.style.setProperty('height', '100%', 'important');
      iframe.style.setProperty('width', `${IFRAME_WIDTH_PX}px`, 'important');
      iframe.style.setProperty('min-width', '1px', 'important');
      iframe.style.setProperty('position', 'fixed', 'important');
      iframe.style.setProperty('top', '0', 'important');
      iframe.style.setProperty('z-index', '2147483647', 'important');
      // Transition désactivée initialement pour éviter le flash lors du positionnement
      iframe.style.setProperty('transition', 'none', 'important');
      iframe.style.setProperty('will-change', 'transform', 'important');
      iframe.style.setProperty('box-shadow', '0 0 15px 2px rgba(0,0,0,0.12)', 'important');
      iframe.style.setProperty('contain', 'strict', 'important');
      // Position par défaut cachée à droite
      iframe.style.setProperty('right', '0', 'important');
      iframe.style.setProperty('left', 'auto', 'important');
      iframe.style.setProperty('transform', `translateX(${IFRAME_OFFSET_PX}px)`, 'important');
      iframe.frameBorder = 'none';
      iframe.src = chrome.runtime.getURL('index.html');
      iframe.addEventListener('load', () => resolveIframeLoaded());

      // Charger la préférence de position AVANT d'insérer l'iframe dans le DOM
      // pour éviter le flash (l'iframe est ajouté directement avec la bonne position)
      chrome.storage.local.get(['tuelloDockedLeft'], (results: Record<string, any>) => {
        dockedLeft = results?.['tuelloDockedLeft'] || false;
        applyDockPosition(iframe, false);
        document.body.appendChild(iframe);
        // Activer la transition après le positionnement initial
        requestAnimationFrame(() => {
          iframe.style.setProperty('transition', 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 'important');
        });
        resolve(iframe);
      });
    });
  }
  return iframePromise;
}

/**
 * L'app Angular (plus d'1 Mo de JS) était démarrée dès que la page devenait interactive,
 * en concurrence avec son propre chargement, dans chaque onglet. Elle attend désormais la
 * fin du chargement et un moment de repos : elle est prête bien avant qu'on ouvre Tuello.
 * Toute demande d'affichage arrivant avant la crée immédiatement (voir createIframe).
 */
function scheduleIframeCreation(): void {
  chrome.storage.local.get(['uiPlayActivated', 'uiRecordActivated'], (results: Record<string, any>) => {
    // Rejeu ou enregistrement Spy en cours : l'app doit recevoir ses messages (fin de
    // rejeu, pause, résultats de comparaison) dès le chargement de la page, comme avant.
    if (results?.['uiPlayActivated'] || results?.['uiRecordActivated']) {
      createIframe();
      return;
    }
    const createWhenIdle = () => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => createIframe(), { timeout: IFRAME_IDLE_TIMEOUT_MS });
      } else {
        createIframe();
      }
    };
    if (document.readyState === 'complete') {
      createWhenIdle();
    } else {
      window.addEventListener('load', createWhenIdle, { once: true });
    }
    setTimeout(() => createIframe(), IFRAME_MAX_DELAY_MS);
  });
}

/** Affiche le panneau, en créant l'iframe si la page ne l'a pas encore fait */
function showIframe(): void {
  createIframe().then((iframe) => {
    iframe.style.display = '';
    show = true;
    applyDockPosition(iframe, true);
  });
}

function activate() {
  // Réactiver le listener mousedown (supprimé lors de la désactivation)
  addMousedownListener();

  const loadPromise = Promise.all([
    loadCompressedMultiple<{
      mouseCoordinates?: boolean;
      tuelloHTTPTags?: unknown;
      httpRecord?: boolean;
      httpMock?: boolean;
      trackPlay?: boolean;
      disabled?: boolean;
      searchElementsActivated?: boolean;
    }>(['mouseCoordinates', 'tuelloHTTPTags', 'httpRecord', 'httpMock', 'trackPlay', 'disabled', 'searchElementsActivated']),
    loadMockRecords()
  ]).then(([settings, records]) => ({ ...settings, ...records }));

  loadPromise.then((results) => {
    if (!results.disabled) {
      // Mettre à jour le cache localStorage pour la prochaine session
      try {
        localStorage.setItem('TUELLO_HTTP_MOCK', results.httpMock ? 'true' : 'false');
      } catch {
        // Ignorer les erreurs localStorage
      }
      if (results.httpMock) {
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: true,
            tuelloRecords: results.tuelloRecords,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
      }
      if (results.httpRecord) {
        window.postMessage(
          {
            type: 'RECORD_HTTP_ACTIVATED',
            value: true,
            isRestore: true, // Restauration depuis le storage, ne pas flusher la queue
            // Distingue cette activation de celle, indépendante, de Spy (/spy) : voir
            // httpmanager.ts, qui combine les deux sources plutôt que de les laisser s'écraser.
            source: 'recorder'
          },
          '*'
        );
        window.addEventListener('message', recordHttpListener);
      } else {
        // Fin de la fenêtre de boot async : l'utilisateur n'a pas activé le record.
        // On désactive l'intercepteur recorder pour ne pas accumuler les requêtes
        // dans messageForHTTPRecorderQueue tant que l'utilisateur ne l'active pas.
        // Ne porte que sur la fonctionnalité Recorder HTTP : ne doit pas couper un
        // enregistrement Spy déjà actif sur cette page (voir `source` côté httpmanager.ts).
        window.postMessage(
          {
            type: 'RECORD_HTTP_ACTIVATED',
            value: false,
            source: 'recorder'
          },
          '*'
        );
      }

      // Une liste vide ([]) est truthy : sans le test de longueur, l'intercepteur restait
      // actif et relisait chaque réponse HTTP de la page pour rien.
      if (Array.isArray(results['tuelloHTTPTags']) && results['tuelloHTTPTags'].length > 0) {
        // On initialise le gestionnaire des tags
        initTagsHandler(results['tuelloHTTPTags']);
      } else {
        // Fin de la fenêtre de boot async : pas de tags configurés.
        // On désactive l'intercepteur tags pour ne pas accumuler les requêtes
        // dans messageForHTTPTagsQueue.
        window.postMessage(
          {
            type: 'RECORD_HTTP_CALL_FOR_TAGS',
            value: false
          },
          '*'
        );
      }
      if (results.trackPlay) {
        activateRecordTracks();
      }
      if (results['searchElementsActivated']) {
        activateSearchElements();
      }
      if (results.mouseCoordinates) {
        addMouseCoordinates();
      }
    } else {
      // Tuello désactivé sur cette page : fermer la fenêtre de boot des
      // intercepteurs HTTP pour éviter d'accumuler les requêtes dans les queues.
      closeInterceptorsBootWindow();
    }
  });
  loadPromise.catch((error) => {
    // Sans ce catch, un échec de lecture du storage laissait les intercepteurs
    // enregistrer indéfiniment dans leurs files d'attente.
    console.warn('Tuello: lecture du storage impossible, intercepteurs HTTP désactivés', error);
    closeInterceptorsBootWindow();
  });
}

/**
 * Referme la fenêtre de boot des intercepteurs HTTP : tant qu'ils n'ont pas reçu
 * d'ordre explicite, ils bufferisent toutes les réponses de la page.
 */
function closeInterceptorsBootWindow() {
  window.postMessage({ type: 'RECORD_HTTP_ACTIVATED', value: false }, '*');
  window.postMessage({ type: 'RECORD_HTTP_CALL_FOR_TAGS', value: false }, '*');
}

// desactive tuello
function desactivate() {
  window.postMessage(
    {
      type: 'MOCK_HTTP_ACTIVATED',
      value: false
    },
    '*'
  );
  // Désactivation globale de Tuello sur cet onglet : sans `source`, httpmanager.ts coupe les
  // deux fonctionnalités (Spy et Recorder HTTP) plutôt qu'une seule — voir `source` ailleurs
  // dans ce fichier et dans uirecorder.ts.
  window.postMessage(
    {
      type: 'RECORD_HTTP_ACTIVATED',
      value: false
    },
    '*'
  );
  // Flusher le buffer avant de retirer le listener pour ne pas perdre
  // les records bufferisés par le debounce.
  flushPendingRecords();
  window.removeEventListener('message', recordHttpListener);
  deleteTagsPanel();

  desactivateRecordTracks();
  desactivateSearchElements();
  removeMouseCoordinates();
  removeMousedownListener();
  chrome.runtime.sendMessage(
    {
      action: 'updateIcon',
      value: 'tuello-stop-32x32.png'
    },
    () => {}
  );
}

// gestion de l'activation et la désactivation du devtools et du record ui
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'JSON_VIEWER') {
    const selectedText = window.getSelection().toString();
    let data;
    if (clickedElement.length >= 50) {
      data = clickedElement;
    } else if (selectedText && selectedText.length >= 50) {
      data = selectedText;
    }
    try {
      const json = JSON.parse(data);
      jsonViewer.open(json);
    } catch (e) {
      try {
        const json = JSON.parse(selectedText.replace(/\n/g, '').replaceAll(' ', ''));
        jsonViewer.open(json);
      } catch (e) {
        // error
        console.log('Tuello : La donnée n est pas du json', e);
      }
    }
    sendResponse();
  }
  if (message === 'toggle') {
    const iframe = document.getElementById('iframeTuello') as HTMLIFrameElement;
    if (!iframe && window.self === window.top) {
      // Pas encore créée (page tout juste chargée) : elle est forcément masquée
      showIframe();
    } else if (iframe) {
      const transform = window.getComputedStyle(iframe).transform;
      // Vérifier si l'iframe est cachée (IFRAME_OFFSET_PX pour droite, -IFRAME_OFFSET_PX pour gauche)
      const isHidden = transform.indexOf(String(IFRAME_OFFSET_PX)) >= 0 || transform === 'none';
      if (isHidden) {
        if (iframe.style.display === 'none') {
          iframe.style.display = '';
        }
        show = true;
        applyDockPosition(iframe, true);
      } else {
        show = false;
        applyDockPosition(iframe, false);
      }
    }
    sendResponse();
  }
  if (message === 'open') {
    const iframe = document.getElementById('iframeTuello') as HTMLIFrameElement;
    if (iframe) {
      show = true;
      applyDockPosition(iframe, true);
    } else if (window.self === window.top) {
      showIframe();
    }
    sendResponse();
  }
  if (message.from === 'background') {
    if (message.devtools) {
      // on désactive le mock et le record de la popup
      window.postMessage(
        {
          type: 'RECORD_HTTP_ACTIVATED',
          value: false
        },
        '*'
      );
      // Flusher le buffer avant de retirer le listener (debounce)
      flushPendingRecords();
      window.removeEventListener('message', recordHttpListener);
      deleteTagsPanel();

      chrome.storage.local.get(['deepMockLevel'], (results) => {
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: false,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
      });
      sendResponse();
    } else {
      sendResponse();
    }
  }
  switch (message.action) {
    case 'DEACTIVATE':
      desactivate();
      break;
    case 'ACTIVATE': {
      const initialized = init();
      if (window.self === window.top) {
        // Réactivation juste après le chargement : ne pas attendre le repos de la page
        createIframe();
      }
      initialized.then(() => {
        if (window.self === window.top) {
          const iframeActivate = document.getElementById('iframeTuello');
          if (iframeActivate) iframeActivate.style.display = '';
        }
        sendResponse();
      });
      return true;
    }
    case 'VIEW_IMAGE':
      if (window.self === window.top) {
        lightboxImg.open(message.value);
      }
      sendResponse();
      break;
    case 'HIDE':
      if (window.self === window.top) {
        const iframeHide = document.getElementById('iframeTuello');
        if (iframeHide) iframeHide.style.display = 'none';
        show = false;
        setTimeout(() => {
          chrome.runtime.sendMessage(
            {
              action: 'HIDE_OK'
            },
            () => {}
          );
        }, 1);
      }
      // Géométrie au moment de la capture (défilement, taille viewport) : permet de replacer
      // correctement un repère de clic sur la capture côté rapport (voir uiRecorderHandler.ts).
      sendResponse({ scrollX: window.scrollX, scrollY: window.scrollY, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
      break;
    case 'TUELLO_PING':
      // Le panneau latéral vérifie que la page a un content script vivant : après un
      // rechargement de l'extension, les pages déjà ouvertes n'en ont plus.
      sendResponse(true);
      break;
    case 'SHOW':
      if (window.self === window.top) {
        show = true;
        const iframeShow = document.getElementById('iframeTuello');
        if (iframeShow) iframeShow.style.display = '';
      }
      sendResponse();
      break;
    case 'TOGGLE_DOCK_POSITION':
      if (window.self === window.top) {
        const iframe = document.getElementById('iframeTuello') as HTMLIFrameElement;
        if (iframe) {
          dockedLeft = message.value;
          applyDockPosition(iframe, show);
        }
      }
      sendResponse();
      break;
    case 'VIEW_CLICK_ACTION':
      const action: IUserAction = message.value;
      displayEffect(action.x, action.y);
      break;

    case 'START_UI_RECORDER':
      launchUIRecorderHandler();
      break;
    case 'MOUSE_COORDINATES':
      if (message.value) {
        addMouseCoordinates();
      } else {
        removeMouseCoordinates();
      }
      sendResponse();
      break;

    case 'HTTP_RECORD_STATE':
      // Bascule explicite de la fonctionnalité Recorder HTTP (/recorder) depuis le panneau :
      // ne doit pas couper un enregistrement Spy déjà actif (voir `source` côté httpmanager.ts).
      window.postMessage(
        {
          type: 'RECORD_HTTP_ACTIVATED',
          value: message.value,
          source: 'recorder'
        },
        '*'
      );

      if (message.value) {
        window.addEventListener('message', recordHttpListener);
      } else {
        // Flusher le buffer avant de retirer le listener (debounce)
        flushPendingRecords();
        window.removeEventListener('message', recordHttpListener);
        deleteTagsPanel();
      }
      sendResponse();
      break;

    case 'HTTP_MOCK_STATE':
      loadCompressedMultiple<{ tuelloRecords?: unknown; deepMockLevel?: number }>(['tuelloRecords', 'deepMockLevel']).then((results) => {
        try {
          localStorage.setItem('TUELLO_HTTP_MOCK', message.value ? 'true' : 'false');
        } catch {
          // Ignorer les erreurs localStorage
        }
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: message.value,
            tuelloRecords: results.tuelloRecords,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );

        sendResponse();
      });
      break;
    case 'MMA_RECORDS_CHANGE':
      loadCompressedMultiple<{ httpMock?: boolean; deepMockLevel?: number; tuelloRecords?: unknown }>(['httpMock', 'deepMockLevel', 'tuelloRecords']).then((results) => {
        // Rafraîchir le cache de démarrage pour ne pas rejouer d'anciens mocks au
        // prochain chargement de la page
        cacheTuelloRecords(Array.isArray(results.tuelloRecords) ? results.tuelloRecords : [], results.deepMockLevel || 0);
        if (results.httpMock) {
          window.postMessage(
            {
              type: 'MOCK_HTTP_ACTIVATED',
              value: true,
              tuelloRecords: results.tuelloRecords,
              deepMockLevel: results.deepMockLevel || 0
            },
            '*'
          );
        }
        sendResponse();
      });
      break;
    case 'MMA_TAGS_CHANGE':
      chrome.storage.local.get(['tuelloHTTPTags'], (results: Record<string, any>) => {
        if (results['tuelloHTTPTags']) {
          // On initialise le gestionnaire des tags
          initTagsHandler(results['tuelloHTTPTags']);
          addTagsPanel(results['tuelloHTTPTags']).then(() => {
            sendResponse();
          });
        }
        if (!Array.isArray(results['tuelloHTTPTags']) || results['tuelloHTTPTags'].length === 0) {
          // Tous les tags supprimés : l'intercepteur n'a plus rien à alimenter
          window.postMessage({ type: 'RECORD_HTTP_CALL_FOR_TAGS', value: false }, '*');
        }
      });
      break;
    case 'TRACK_PLAY_STATE':
      if (message.value) {
        activateRecordTracks();
      } else {
        desactivateRecordTracks();
      }

      sendResponse();
      break;

    case 'ACTIONS_RESULTS':
      if (window.self === window.top) {
        // le bandeau de commentaire ne doit pas survivre à la fin du rejeu
        hideComment();
        // SHOW
        showIframe();

        chrome.runtime.sendMessage(
          {
            action: 'updateIcon',
            value: 'tuello-32x32.png'
          },
          () => {}
        );

        chrome.runtime.sendMessage(
          {
            action: 'FINISH_PLAY_ACTIONS'
          },
          () => {}
        );

        // disabled Mock http
        chrome.runtime.sendMessage(
          {
            action: 'MOCK_HTTP_USER_ACTION',
            value: false
          },
          () => {}
        );

        if (message.value?.comparisonResults?.length > 0) {
          // settimeout permet à tuello de s'afficher et permettre d'ecouter ce message
          setTimeout(() => {
            chrome.runtime.sendMessage(
              {
                action: 'SHOW_COMPARISON_RESULTS',
                value: message.value.comparisonResults
              },
              () => {}
            );
          }, 1);
        }
      }
      sendResponse();
      break;
    case 'SHOW_REPLAY_COMMENT':
      if (window.self === window.top) {
        showComment(message.value, message.durationMs);
      }
      sendResponse(true);
      break;
    case 'HIDE_REPLAY_COMMENT':
      if (window.self === window.top) {
        hideComment();
      }
      sendResponse(true);
      break;
    case 'PLAY_USER_ACTION':
      // Le résultat de run() doit être renvoyé tel quel : le player en déduit si
      // l'action a réussi (une image introuvable résout false).
      run(message.value)
        .then((result) => {
          sendResponse(result !== false);
        })
        .catch(() => {
          sendResponse(false);
        });
      return true;
    case 'MOCK_HTTP_USER_ACTION':
      chrome.storage.local.get(['deepMockLevel'], (results) => {
        try {
          localStorage.setItem('TUELLO_HTTP_MOCK', message.value ? 'true' : 'false');
        } catch {
          // Ignorer les erreurs localStorage
        }
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: message.value,
            tuelloRecords: message.data,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
      });
      sendResponse();
      break;
  }
  return true;
});

/**
 * Listener des post message provenant de httpmanager.js
 */
window.addEventListener(
  'message',
  (event) => {
    if (event?.data?.type) {
      switch (event.data.type) {
        case 'VIEW_IMAGE_CLOSED':
          // send message to popup
          chrome.runtime.sendMessage(
            {
              action: 'VIEW_IMAGE_CLOSED'
            },
            () => {}
          );
          break;
      }
    } else if (event.data?.action === 'LOG_DATA') {
      if (verboseMode) {
        console.log(prefix, ...event.data.value);
      } else if (verboseMode === undefined) {
        // Logs du démarrage, arrivés avant la lecture du réglage
        chrome.storage.local.get(['verboseMode'], (results) => {
          if (results.verboseMode) {
            console.log(prefix, ...event.data.value);
          }
        });
      }
    }
  },
  false
);
