import { loadCompressed, saveCompressed } from '../utils/compression';
import { removeDuplicateEntries, removeDuplicatesKeepLast, stringContainedInURL } from '../utils/utils';

/**
 * Persistance des enregistrements HTTP, centralisée dans le service worker.
 *
 * Ce read-modify-write vivait auparavant dans le content script, avec un mutex
 * local à la page : deux onglets qui enregistraient en même temps se écrasaient
 * mutuellement leurs écritures. Le service worker étant unique pour l'extension,
 * sérialiser ici suffit à garantir qu'aucun batch n'est perdu.
 */

export interface HttpRecordEntry {
  key: string;
  method?: string;
  response: any;
  httpCode: number;
  delay?: number;
  headers?: Record<string, string>;
}

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

/**
 * Clé d'unicité d'un mock : URL + méthode HTTP.
 * Les enregistrements antérieurs n'ont pas de `method` : ils gardent une clé
 * sans méthode et restent donc dédoublonnés comme avant.
 */
const mockDuplicateKey = (item: { key: string; method?: string }): string => `${(item.method || '').toUpperCase()} ${item.key}`;

const getLocal = <T>(key: string): Promise<T | undefined> => new Promise((resolve) => chrome.storage.local.get([key], (r: Record<string, any>) => resolve(r[key])));

// Chaîne de promesses : chaque batch attend la fin du précédent.
let writeChain: Promise<void> = Promise.resolve();

/**
 * Ajoute un lot d'enregistrements à tuelloRecords et au profil actif.
 * Retourne true si au moins un enregistrement a été retenu (après filtre).
 */
export function appendHttpRecords(batch: HttpRecordEntry[]): Promise<boolean> {
  if (!Array.isArray(batch) || batch.length === 0) {
    return Promise.resolve(false);
  }

  const result = writeChain.then(() => persistBatch(batch));
  // La chaîne ne doit jamais être rompue par une erreur de batch
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function persistBatch(batch: HttpRecordEntry[]): Promise<boolean> {
  const [tuelloRecords, tuelloHTTPOverWrite, tuelloHTTPFilter, mockProfilesData] = await Promise.all([
    loadCompressed<any[]>('tuelloRecords'),
    getLocal<boolean>('tuelloHTTPOverWrite'),
    getLocal<string>('tuelloHTTPFilter'),
    loadCompressed<MockProfilesStorage>('tuelloMockProfiles')
  ]);

  const accepted = batch.filter((r) => !tuelloHTTPFilter || stringContainedInURL(tuelloHTTPFilter, r.key));
  if (accepted.length === 0) {
    return false;
  }

  // Insérer tout le batch en tête en une seule passe : un unshift() par record
  // recopie tout le tableau à chaque fois (O(n²) sur un gros historique).
  // reverse() pour conserver l'ordre d'origine : le plus récent en tête.
  let records = accepted.slice().reverse().concat(tuelloRecords || []);

  // Une seule passe de dédoublonnage pour tout le batch
  records = tuelloHTTPOverWrite === false ? removeDuplicatesKeepLast(records, mockDuplicateKey) : removeDuplicateEntries(records, mockDuplicateKey);

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

  return true;
}
