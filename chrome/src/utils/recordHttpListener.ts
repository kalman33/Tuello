import { loadCompressed, saveCompressed, decompress, compress } from './compression';
import { removeDuplicateEntries, removeDuplicatesKeepLast, stringContainedInURL } from './utils';

interface MockProfile {
  id: string;
  name: string;
  mocks: any[];
  createdAt: number;
  updatedAt: number;
}

interface MockProfilesStorage {
  profiles: MockProfile[];
  activeProfileId: string;
}

interface NewRecord {
  key: string;
  response: any;
  httpCode: number;
  delay: number | undefined;
  headers: Record<string, string> | undefined;
}

// Debounce : on attend que la rafale de requêtes se calme avant d'écrire
// dans chrome.storage (qui est coûteux : décompression LZ + JSON.parse + dédoublonnage
// + JSON.stringify + recompression de tout le tableau tuelloRecords).
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
 * Écrit le buffer accumulé dans chrome.storage en une seule passe.
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

  // Drainer le buffer AVANT le await : si un record arrive pendant qu'on écrit,
  // il finit dans le prochain batch (un nouveau timer sera planifié).
  const batch = pendingRecords;
  pendingRecords = [];

  return mutex
    .lock()
    .then(async () => {
      try {
        const [tuelloRecords, tuelloHTTPOverWrite, tuelloHTTPFilter, mockProfilesData] = await Promise.all([
          loadCompressed<any[]>('tuelloRecords'),
          new Promise<boolean | undefined>((resolve) => {
            chrome.storage.local.get(['tuelloHTTPOverWrite'], (r) => resolve(r.tuelloHTTPOverWrite));
          }),
          new Promise<string | undefined>((resolve) => {
            chrome.storage.local.get(['tuelloHTTPFilter'], (r) => resolve(r.tuelloHTTPFilter));
          }),
          loadCompressed<MockProfilesStorage>('tuelloMockProfiles')
        ]);

        let records = tuelloRecords || [];
        let anyAdded = false;

        // Insérer tout le batch en mémoire avant le dédoublonnage
        for (const r of batch) {
          if (!tuelloHTTPFilter || stringContainedInURL(tuelloHTTPFilter, r.key)) {
            records.unshift(r);
            anyAdded = true;
          }
        }

        if (anyAdded) {
          // Une seule passe de dédoublonnage pour tout le batch
          if (tuelloHTTPOverWrite === false) {
            records = removeDuplicatesKeepLast(records);
          } else {
            records = removeDuplicateEntries(records);
          }

          // Une seule écriture pour le batch entier
          await saveCompressed('tuelloRecords', records);

          // Synchroniser avec le profil actif
          if (mockProfilesData?.activeProfileId && mockProfilesData?.profiles) {
            const activeProfile = mockProfilesData.profiles.find((p) => p.id === mockProfilesData.activeProfileId);
            if (activeProfile) {
              activeProfile.mocks = records;
              activeProfile.updatedAt = Date.now();
              await saveCompressed('tuelloMockProfiles', mockProfilesData);
            }
          }

          chrome.runtime.sendMessage({ refresh: true }, () => {});
        }

        mutex.unlock();
      } catch (error) {
        console.error("Tuello: Erreur lors de l'enregistrement HTTP:", error);
        mutex.unlock();
      }
    })
    .catch((error) => {
      console.error("Tuello: Erreur lors de l'acquisition du verrou :", error);
    });
}

// Best-effort : flush ce qui reste si la page se ferme avant le debounce.
// chrome.storage.local.set est async, donc l'écriture peut ne pas aboutir si
// le navigateur tue la page trop vite, mais sur des batchs courts ça passe
// la plupart du temps.
window.addEventListener('beforeunload', () => {
  if (pendingRecords.length > 0) {
    flushPendingRecords();
  }
});

// Définition d'une classe Mutex pour le verrouillage
class Mutex {
  private locked: boolean;
  private queue: (() => void)[];

  constructor() {
    this.locked = false;
    this.queue = [];
  }

  lock(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.locked) {
        this.queue.push(resolve);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }

  unlock(): void {
    // Protection contre le double unlock
    if (!this.locked && this.queue.length === 0) {
      console.warn("Tuello: Tentative de déverrouillage d'un mutex non verrouillé");
      return;
    }

    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift();
      if (nextResolve) {
        this.locked = true; // Maintenir le verrou pour le prochain acquéreur
        nextResolve();
      }
    } else {
      this.locked = false;
    }
  }
}

// Création d'une instance de Mutex
const mutex = new Mutex();
