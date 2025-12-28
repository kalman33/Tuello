import { Injectable } from '@angular/core';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

/** Préfixe pour identifier les données compressées */
const COMPRESSION_PREFIX = 'LZ:';

/** Clés à compresser automatiquement */
export const COMPRESSED_KEYS = [
  'tuelloRecords',
  'uiRecord',
  'tuelloTracks',
  'tuelloTracksBody'
];

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

@Injectable({ providedIn: 'root' })
export class CompressionService {

  /**
   * Compresse une valeur en UTF-16 optimisé pour chrome.storage
   */
  compress<T>(data: T): string {
    const json = JSON.stringify(data);
    const compressed = compressToUTF16(json);
    return COMPRESSION_PREFIX + compressed;
  }

  /**
   * Décompresse une valeur. Gère aussi les données non compressées (migration).
   */
  decompress<T>(data: string | T): T {
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
  isCompressed(data: unknown): boolean {
    return typeof data === 'string' && data.startsWith(COMPRESSION_PREFIX);
  }

  /**
   * Calcule les statistiques de compression
   */
  getCompressionStats<T>(data: T): CompressionStats {
    const json = JSON.stringify(data);
    const originalSize = new Blob([json]).size;
    const compressed = this.compress(data);
    const compressedSize = new Blob([compressed]).size;

    return {
      originalSize,
      compressedSize,
      ratio: originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0
    };
  }

  /**
   * Formate une taille en bytes en format lisible
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * Sauvegarde avec compression dans chrome.storage.local
   */
  saveCompressed<T>(key: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const compressed = this.compress(data);
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
  loadCompressed<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], results => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const data = results[key];
        if (data === undefined || data === null) {
          resolve(null);
          return;
        }

        try {
          const decompressed = this.decompress<T>(data);

          // Migration: si les données n'étaient pas compressées, les recompresser
          if (!this.isCompressed(data)) {
            this.saveCompressed(key, decompressed).catch(console.error);
          }

          resolve(decompressed);
        } catch (error) {
          console.error(`Erreur décompression pour ${key}:`, error);
          reject(error);
        }
      });
    });
  }

  /**
   * Obtient les statistiques de stockage pour toutes les clés compressées
   */
  async getStorageStats(): Promise<Map<string, CompressionStats & { currentSize: number }>> {
    const stats = new Map<string, CompressionStats & { currentSize: number }>();

    return new Promise((resolve) => {
      chrome.storage.local.get(COMPRESSED_KEYS, results => {
        for (const key of COMPRESSED_KEYS) {
          const data = results[key];
          if (data !== undefined && data !== null) {
            try {
              const decompressed = this.decompress(data);
              const originalSize = new Blob([JSON.stringify(decompressed)]).size;
              const currentSize = new Blob([typeof data === 'string' ? data : JSON.stringify(data)]).size;
              const isCurrentlyCompressed = this.isCompressed(data);

              stats.set(key, {
                originalSize,
                compressedSize: isCurrentlyCompressed ? currentSize : this.compress(decompressed).length * 2,
                currentSize,
                ratio: originalSize > 0 ? Math.round((1 - currentSize / originalSize) * 100) : 0
              });
            } catch {
              // Ignorer les erreurs de parsing
            }
          }
        }
        resolve(stats);
      });
    });
  }
}
