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

export function recordHttpListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    mutex
      .lock()
      .then(async () => {
        try {
          // Charger les données avec décompression
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

          if (!tuelloHTTPFilter || stringContainedInURL(tuelloHTTPFilter, event.data.url)) {
            const newRecord = {
              key: event.data.url,
              response: event.data.error || event.data.response,
              httpCode: event.data.status,
              delay: event.data.delay,
              headers: event.data.headers
            };

            records.unshift(newRecord);

            // Appliquer la déduplication
            if (tuelloHTTPOverWrite === false) {
              records = removeDuplicatesKeepLast(records);
            } else {
              records = removeDuplicateEntries(records);
            }

            // Sauvegarder dans tuelloRecords (compressé)
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
}

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
        nextResolve();
      }
    } else {
      this.locked = false;
    }
  }
}

// Création d'une instance de Mutex
const mutex = new Mutex();
