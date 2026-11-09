import { createFirstSeenFilter } from './recordDedup';

const isFirstSeen = createFirstSeenFilter();

/** Transmet au service worker une requête HTTP captée pendant un enregistrement Spy */
function sendHttpUserAction(data: any, onlyIfRecording = false): void {
  chrome.runtime.sendMessage(
    {
      action: 'RECORD_HTTP',
      value: {
        key: data.url,
        response: data.error || data.response,
        httpCode: data.status,
        headers: data.headers,
        requestHeaders: data.requestHeaders,
        delay: data.delay,
        method: data.method,
        duration: data.duration,
        body: data.body,
        timestamp: data.timestamp,
        requestId: data.requestId,
        // Niveau de frame (0 = page principale) : au rejeu, la réponse ne sert qu'aux requêtes de ce niveau
        frameLevel: typeof data.frameLevel === 'number' ? data.frameLevel : undefined
      },
      onlyIfRecording
    },
    () => chrome.runtime.lastError
  );
}

export function recordHttpUserActionListener(event: MessageEvent) {
  if (event?.data?.type !== 'RECORD_HTTP') return;
  // Message rejoué depuis la file de boot de Recorder HTTP : pas pour Spy
  if (event.data.target && event.data.target !== 'spy') return;
  if (!isFirstSeen(event.data.requestId)) return;
  sendHttpUserAction(event.data);
}

/**
 * Requêtes récupérées dans la file de boot de Spy au moment où le document disparaît, avant
 * que ce content script ait su si un enregistrement Spy était en cours : le service worker
 * le vérifie lui-même (`onlyIfRecording`).
 */
export function sendDrainedHttpUserActions(messages: any[]): void {
  try {
    messages.filter((m) => isFirstSeen(m.requestId)).forEach((m) => sendHttpUserAction(m, true));
  } catch {
    // Contexte d'extension invalidé : plus rien à transmettre
  }
}
