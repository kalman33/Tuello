import { removeDuplicateEntries } from './utils';

export function recordHttpListener(event: MessageEvent) {

  if (event?.data?.type === 'RECORD_HTTP') {
    mutex.lock()
      .then(() => {
        chrome.storage.local.get(['tuelloRecords'], (items) => {
          if (!chrome.runtime.lastError) {
            if (!items.tuelloRecords || !Array.isArray(items.tuelloRecords)) {
              items.tuelloRecords = [];
            }
            if (event.data.error) {
              items.tuelloRecords.unshift({
                key: event.data.url,
                response: event.data.error,
                httpCode: event.data.status,
                delay: event.data.delay
              });
            } else {
              items.tuelloRecords.unshift({
                key: event.data.url,
                response: event.data.response,
                httpCode: event.data.status,
                delay: event.data.delay
              });
            }

            chrome.storage.local.set({ tuelloRecords: removeDuplicateEntries(items.tuelloRecords) }, () => {
              chrome.runtime.sendMessage(
                { refresh: true },
                (response) => { }
              );
              mutex.unlock(); // Déverrouiller une fois que le stockage local est mis à jour
            });
          }
        });
      })
      .catch((error) => {
        console.error('Erreur lors de l\'acquisition du verrou :', error);
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