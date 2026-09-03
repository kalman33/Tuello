/**
 * Comparaison d'images PNG partagée entre le player (comparaison de screenshots)
 * et le recorder d'images (recherche d'une image dans le DOM).
 *
 * Les deux usages ont besoin exactement des mêmes précautions :
 *  - pixelmatch exige deux buffers de dimensions strictement identiques,
 *    d'où le redimensionnement du candidat plutôt qu'un simple abandon ;
 *  - pixelmatch construit une vue Uint32Array sur le buffer, dont l'offset doit
 *    être aligné sur 4 octets (ce qui n'est pas garanti avec les Buffer pngjs).
 */
import { PNG } from 'pngjs/browser';
import pixelmatch from 'pixelmatch';
import { Buffer } from 'buffer';

export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

export interface PngImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface CompareOptions {
  /** Seuil de tolérance pixelmatch (0 à 1) */
  threshold?: number;
  /** Génère l'image de différence (coûteux : à n'activer que si elle est affichée) */
  withDiff?: boolean;
  /**
   * Ecart de ratio largeur/hauteur au-delà duquel on considère les images
   * incomparables sans même les comparer. Non défini : on compare toujours.
   */
  aspectRatioTolerance?: number;
}

export interface CompareResult {
  /** Pourcentage de pixels différents (0 à 100) */
  differencePercent: number;
  mismatchedPixels: number;
  width: number;
  height: number;
  /** true si le candidat a dû être redimensionné pour être comparable */
  rescaled: boolean;
  /** Image de différence en data URL, si withDiff */
  diffDataUrl: string | null;
}

/**
 * Décode une image PNG encodée en data URL (ou en base64 brut)
 */
export function readPng(dataUrl: string): PngImage {
  const base64 = dataUrl.startsWith(PNG_DATA_URL_PREFIX) ? dataUrl.slice(PNG_DATA_URL_PREFIX.length) : dataUrl.slice(dataUrl.indexOf(',') + 1);
  const png = PNG.sync.read(Buffer.from(base64, 'base64'));
  return { data: png.data, width: png.width, height: png.height };
}

/**
 * Encode un buffer RGBA en data URL PNG
 */
export function writePngDataUrl(data: Uint8Array, width: number, height: number): string {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return PNG_DATA_URL_PREFIX + PNG.sync.write(png).toString('base64');
}

/**
 * pixelmatch construit une vue Uint32Array sur le buffer : l'offset doit être aligné sur 4 octets
 */
export function toAlignedPixels(data: Uint8Array): Uint8Array {
  if (data.byteOffset % 4 === 0) {
    return data;
  }
  return new Uint8Array(data);
}

/**
 * Redimensionne un buffer RGBA (plus proche voisin) pour permettre la comparaison
 * de deux rendus d'une même image à des résolutions différentes
 */
export function resizeRgba(data: Uint8Array, srcWidth: number, srcHeight: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const xRatio = srcWidth / width;
  const yRatio = srcHeight / height;

  for (let y = 0; y < height; y++) {
    const srcY = Math.min(srcHeight - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor(x * xRatio));
      const srcIndex = (srcY * srcWidth + srcX) * 4;
      const destIndex = (y * width + x) * 4;
      out[destIndex] = data[srcIndex];
      out[destIndex + 1] = data[srcIndex + 1];
      out[destIndex + 2] = data[srcIndex + 2];
      out[destIndex + 3] = data[srcIndex + 3];
    }
  }

  return out;
}

/**
 * Compare deux images déjà décodées. Le candidat est ramené aux dimensions de la
 * référence si nécessaire : sans ça pixelmatch lève "Image sizes do not match" dès
 * que la fenêtre n'a pas exactement la taille de l'enregistrement.
 */
export function comparePngImages(reference: PngImage, candidate: PngImage, options: CompareOptions = {}): CompareResult {
  const { threshold = 0.1, withDiff = false, aspectRatioTolerance } = options;

  const width = reference.width;
  const height = reference.height;
  const totalPixels = width * height;

  if (!totalPixels) {
    return { differencePercent: 100, mismatchedPixels: 0, width, height, rescaled: false, diffDataUrl: null };
  }

  let candidateData = candidate.data;
  let rescaled = false;

  if (candidate.width !== width || candidate.height !== height) {
    if (aspectRatioTolerance !== undefined) {
      const referenceRatio = width / height;
      const candidateRatio = candidate.width / candidate.height;
      if (Math.abs(referenceRatio - candidateRatio) > aspectRatioTolerance) {
        return { differencePercent: 100, mismatchedPixels: totalPixels, width, height, rescaled: false, diffDataUrl: null };
      }
    }
    candidateData = resizeRgba(candidate.data, candidate.width, candidate.height, width, height);
    rescaled = true;
  }

  const diffData = withDiff ? new Uint8Array(totalPixels * 4) : null;

  const mismatchedPixels = pixelmatch(toAlignedPixels(reference.data), toAlignedPixels(candidateData), diffData, width, height, { threshold });

  return {
    differencePercent: (mismatchedPixels / totalPixels) * 100,
    mismatchedPixels,
    width,
    height,
    rescaled,
    diffDataUrl: diffData ? writePngDataUrl(diffData, width, height) : null
  };
}

/**
 * Compare deux images fournies en data URL
 */
export function comparePngDataUrls(referenceDataUrl: string, candidateDataUrl: string, options: CompareOptions = {}): CompareResult {
  return comparePngImages(readPng(referenceDataUrl), readPng(candidateDataUrl), options);
}
