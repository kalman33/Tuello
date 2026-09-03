interface NewRecord {
  key: string;
  method: string | undefined;
  response: any;
  httpCode: number;
  delay: number | undefined;
  headers: Record<string, string> | undefined;
}

// Debounce : on attend que la rafale de requêtes se calme avant de transmettre le
// lot au service worker (qui décompresse, dédoublonne et recompresse tout le
// tableau tuelloRecords à chaque écriture).
const FLUSH_DEBOUNCE_MS = 500;
// Garde-fou : si la rafale ne s'arrête pas, on flush quand même au-delà de ce seuil
// pour éviter que le buffer grossisse indéfiniment en mémoire et que l'UI tarde trop.
const MAX_BUFFER_SIZE = 20;

let pendingRecords: NewRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function recordHttpListener(event: MessageEvent) {
  if (event?.data?.type !== 'RECORD_HTTP') return;

  pendingRecords.push({
    key: event.data.url,
    method: typeof event.data.method === 'string' && event.data.method ? event.data.method.toUpperCase() : undefined,
    response: event.data.error || event.data.response,
    httpCode: event.data.status,
    delay: event.data.delay,
    headers: event.data.headers
  });

  // Flush immédiat si la rafale dépasse le seuil
  if (pendingRecords.length >= MAX_BUFFER_SIZE) {
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
 *  - sur beforeunload (best-effort)
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
          console.warn("Tuello: Enregistrement HTTP non transmis:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (error) {
      // Contexte d'extension invalidé : le content script ne peut plus rien écrire
      console.warn("Tuello: Enregistrement HTTP impossible:", error);
      resolve();
    }
  });
}

// Best-effort : flush ce qui reste si la page se ferme avant le debounce.
// L'envoi part immédiatement vers le service worker, qui survit à la page :
// l'écriture aboutit donc même si l'onglet disparaît juste après.
window.addEventListener('beforeunload', () => {
  if (pendingRecords.length > 0) {
    flushPendingRecords();
  }
});
