import { createFirstSeenFilter } from './recordDedup';
import { sendDrainedHttpUserActions } from './recordUserActionListener';

const isFirstSeen = createFirstSeenFilter();

interface NewRecord {
  key: string;
  method: string | undefined;
  response: any;
  httpCode: number;
  delay: number | undefined;
  headers: Record<string, string> | undefined;
  frameLevel: number | undefined;
}

// Debounce : on attend que la rafale de requêtes se calme avant de transmettre le
// lot au service worker (qui décompresse, dédoublonne et recompresse tout le
// tableau tuelloRecords à chaque écriture).
const FLUSH_DEBOUNCE_MS = 500;
// Garde-fou : si la rafale ne s'arrête pas, on flush quand même au-delà de ce seuil
// pour éviter que le buffer grossisse indéfiniment en mémoire et que l'UI tarde trop.
const MAX_BUFFER_SIZE = 20;

// Après un beforeunload, le document peut être détruit à tout instant : on ne peut plus
// compter sur le timer du debounce. On retombe sur le debounce au-delà de ce délai, au cas
// où la navigation aurait été annulée (boîte de dialogue "quitter la page ?", téléchargement...).
const UNLOAD_GRACE_MS = 5000;

let pendingRecords: NewRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unloadingSince = 0;

const isUnloading = (): boolean => unloadingSince > 0 && Date.now() - unloadingSince < UNLOAD_GRACE_MS;

/** Convertit un message RECORD_HTTP de httpmanager.js en enregistrement à persister */
function toRecord(data: any): NewRecord {
  return {
    key: data.url,
    method: typeof data.method === 'string' && data.method ? data.method.toUpperCase() : undefined,
    response: data.error || data.response,
    httpCode: data.status,
    delay: data.delay,
    headers: data.headers,
    // Niveau de frame (0 = page principale) : au rejeu, le mock ne répond qu'aux requêtes de ce niveau
    frameLevel: typeof data.frameLevel === 'number' ? data.frameLevel : undefined
  };
}

export function recordHttpListener(event: MessageEvent) {
  if (event?.data?.type !== 'RECORD_HTTP') return;
  // Message rejoué depuis la file de boot de Spy : pas pour Recorder HTTP
  if (event.data.target && event.data.target !== 'recorder') return;
  if (!isFirstSeen(event.data.requestId)) return;

  pendingRecords.push(toRecord(event.data));

  // Flush immédiat si la rafale dépasse le seuil, ou si le document est en train d'être
  // quitté : une réponse arrivée entre beforeunload et la destruction du document (cas
  // typique d'une iframe qui navigue vers une autre application juste après ses appels)
  // serait sinon perdue avec le timer du debounce.
  if (pendingRecords.length >= MAX_BUFFER_SIZE || isUnloading()) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushPendingRecords();
    return;
  }

  // Sinon, on (re)programme le debounce
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPendingRecords, FLUSH_DEBOUNCE_MS);
}

/**
 * Transmet le buffer accumulé au service worker, qui est seul à écrire dans
 * chrome.storage : la lecture-modification-écriture se faisait auparavant ici,
 * derrière un verrou local à la page, ce qui ne protégeait pas de la concurrence
 * entre plusieurs onglets enregistrant en même temps.
 *
 * Doit être appelée :
 *  - automatiquement après FLUSH_DEBOUNCE_MS d'inactivité
 *  - automatiquement quand le buffer dépasse MAX_BUFFER_SIZE
 *  - manuellement par contentscript juste avant de désactiver le record
 *    (sinon les records bufferisés seraient perdus)
 *  - sur beforeunload / pagehide (best-effort)
 */
export function flushPendingRecords(): Promise<void> {
  flushTimer = null;
  if (pendingRecords.length === 0) return Promise.resolve();

  // Drainer le buffer avant l'envoi : si un record arrive entre-temps,
  // il finit dans le prochain batch (un nouveau timer sera planifié).
  const batch = pendingRecords;
  pendingRecords = [];

  return new Promise<void>((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'RECORD_HTTP_BATCH', value: batch }, () => {
        // lastError est lu pour éviter les "Unchecked runtime.lastError" quand le
        // service worker est indisponible (extension rechargée, page orpheline).
        if (chrome.runtime.lastError) {
          console.warn('Tuello: Enregistrement HTTP non transmis:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (error) {
      // Contexte d'extension invalidé : le content script ne peut plus rien écrire
      console.warn('Tuello: Enregistrement HTTP impossible:', error);
      resolve();
    }
  });
}

// Best-effort : flush ce qui reste si le document disparaît avant le debounce.
// L'envoi part immédiatement vers le service worker, qui survit à la page :
// l'écriture aboutit donc même si l'onglet (ou l'iframe) disparaît juste après.
//  - beforeunload : navigation du document ; les records arrivant ensuite partent sans debounce
//  - pagehide : dernier point de passage, y compris quand il n'y a pas eu de beforeunload
//    (iframe retirée du DOM ou remplacée par la page parente)
const flushOnExit = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingRecords.length > 0) {
    flushPendingRecords();
  }
};

/**
 * Récupère les requêtes que httpmanager.js garde en attente tant que les content scripts
 * n'ont pas décidé si l'enregistrement est actif (lecture asynchrone du storage, lancée
 * seulement quand le document devient interactif) — une file pour Recorder HTTP, une pour Spy.
 * Un document quitté avant cette décision emportait ces requêtes avec lui. L'échange est
 * synchrone (événements DOM) : c'est le seul qui aboutisse encore pendant un pagehide.
 *
 * Ce content script ne sachant pas encore si l'enregistrement est actif, c'est le service
 * worker qui le vérifie avant de persister (`onlyIfRecording`).
 */
function flushBootQueue(): void {
  const parseMessages = (serialized: unknown): any[] => {
    if (!Array.isArray(serialized)) return [];
    const messages: any[] = [];
    for (const item of serialized) {
      try {
        const message = JSON.parse(item);
        if (message?.type === 'RECORD_HTTP' && typeof message.url === 'string') messages.push(message);
      } catch {
        // Message illisible : ignoré
      }
    }
    return messages;
  };

  let forRecorder: any[] = [];
  let forSpy: any[] = [];
  const onDrained = (event: Event) => {
    try {
      const queues = JSON.parse((event as CustomEvent).detail);
      forRecorder = parseMessages(queues?.recorder);
      forSpy = parseMessages(queues?.spy);
    } catch {
      // Détail illisible : rien à récupérer
    }
  };
  window.addEventListener('TUELLO_RECORD_QUEUE_DRAINED', onDrained);
  window.dispatchEvent(new Event('TUELLO_DRAIN_RECORD_QUEUE'));
  window.removeEventListener('TUELLO_RECORD_QUEUE_DRAINED', onDrained);

  const drained = forRecorder.filter((m) => isFirstSeen(m.requestId)).map(toRecord);
  if (drained.length > 0) {
    try {
      chrome.runtime.sendMessage({ action: 'RECORD_HTTP_BATCH', value: drained, onlyIfRecording: true }, () => chrome.runtime.lastError);
    } catch {
      // Contexte d'extension invalidé : plus rien à transmettre
    }
  }
  if (forSpy.length > 0) {
    sendDrainedHttpUserActions(forSpy);
  }
}

window.addEventListener('beforeunload', () => {
  unloadingSince = Date.now();
  flushOnExit();
});

window.addEventListener('pagehide', () => {
  unloadingSince = Date.now();
  // Uniquement ici (pas sur beforeunload, annulable) : le document disparaît pour de bon
  flushBootQueue();
  flushOnExit();
});
