import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

/** Préfixe pour identifier les données compressées */
const COMPRESSION_PREFIX = 'LZ:';

/** Clés à compresser automatiquement */
export const COMPRESSED_KEYS = [
  'tuelloRecords',
  'uiRecord',
  'tuelloTracks',
  'tuelloTracksBody',
  'tuelloMockProfiles'
];

/**
 * Compresse une valeur en UTF-16 optimisé pour chrome.storage
 */
export function compress<T>(data: T): string {
  const json = JSON.stringify(data);
  const compressed = compressToUTF16(json);
  return COMPRESSION_PREFIX + compressed;
}

/**
 * Décompresse une valeur. Gère aussi les données non compressées (migration).
 */
export function decompress<T>(data: string | T): T {
  // Si ce n'est pas une chaîne, retourner tel quel (déjà un objet)
  if (typeof data !== 'string') {
    return data as T;
  }

  // Si pas de préfixe, c'est une ancienne donnée non compressée
  if (!data.startsWith(COMPRESSION_PREFIX)) {
    // Tenter de parser comme JSON
    try {
      return JSON.parse(data) as T;
    } catch {
      // Si échec, retourner tel quel (probablement déjà un objet sérialisé par Chrome)
      return data as unknown as T;
    }
  }

  // Décompresser
  const compressed = data.slice(COMPRESSION_PREFIX.length);
  const json = decompressFromUTF16(compressed);
  if (!json) {
    throw new Error('Échec de décompression des données');
  }
  return JSON.parse(json) as T;
}

/**
 * Vérifie si une donnée est compressée
 */
export function isCompressed(data: unknown): boolean {
  return typeof data === 'string' && data.startsWith(COMPRESSION_PREFIX);
}

/**
 * Sauvegarde avec compression dans chrome.storage.local
 */
export function saveCompressed<T>(key: string, data: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const compressed = compress(data);
    chrome.storage.local.set({ [key]: compressed }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Charge et décompresse depuis chrome.storage.local
 * Gère automatiquement les anciennes données non compressées
 */
export function loadCompressed<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], results => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Erreur lecture storage pour ${key}: ${chrome.runtime.lastError.message}`));
        return;
      }

      const data = results[key];
      if (data === undefined || data === null) {
        resolve(null);
        return;
      }

      try {
        const decompressed = decompress<T>(data);

        // Migration: si les données n'étaient pas compressées, les recompresser
        if (!isCompressed(data)) {
          saveCompressed(key, decompressed).catch(err => {
            // Log mais ne pas bloquer - la migration peut échouer si quota dépassé
            console.warn(`Migration compression échouée pour ${key}:`, err.message);
          });
        }

        resolve(decompressed);
      } catch (error) {
        console.error(`Erreur décompression pour ${key}:`, error);
        // Tenter de retourner les données brutes en cas d'échec de décompression
        try {
          if (typeof data === 'object') {
            resolve(data as T);
          } else {
            reject(new Error(`Données corrompues pour ${key}`));
          }
        } catch {
          reject(error);
        }
      }
    });
  });
}

/**
 * Charge plusieurs clés avec décompression automatique
 */
export function loadCompressedMultiple<T extends Record<string, unknown>>(keys: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, results => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Erreur lecture storage multiple: ${chrome.runtime.lastError.message}`));
        return;
      }

      const decompressedResults: Record<string, unknown> = {};

      for (const key of keys) {
        const data = results[key];
        if (data !== undefined && data !== null) {
          try {
            const decompressed = decompress(data);
            decompressedResults[key] = decompressed;

            // Migration: si les données n'étaient pas compressées, les recompresser
            if (COMPRESSED_KEYS.includes(key) && !isCompressed(data)) {
              saveCompressed(key, decompressed).catch(err => {
                console.warn(`Migration compression échouée pour ${key}:`, err.message);
              });
            }
          } catch (err) {
            // Si erreur de décompression, garder la valeur originale si c'est un objet
            console.warn(`Erreur décompression pour ${key}, utilisation des données brutes:`, err);
            decompressedResults[key] = typeof data === 'object' ? data : undefined;
          }
        } else {
          decompressedResults[key] = data;
        }
      }

      resolve(decompressedResults as T);
    });
  });
}
