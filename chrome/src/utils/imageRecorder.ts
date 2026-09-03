import { ImageType, IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { PNG } from 'pngjs/browser';
import pixelmatch from 'pixelmatch';
import { Buffer } from 'buffer';
import domtoimage from 'dom-to-image';

/** Cache des images trouvées pour éviter les recherches répétées */
const cache: Map<string, HTMLElement> = new Map();

/** Seuil de correspondance (5% de différence max) */
const MATCH_THRESHOLD_PERCENT = 5;

/** Seuil de correspondance quand l'image candidate a dû être redimensionnée (interpolation = plus de bruit) */
const RESCALED_MATCH_THRESHOLD_PERCENT = 20;

/** Ecart de ratio largeur/hauteur au delà duquel on ne compare même pas */
const ASPECT_RATIO_TOLERANCE = 0.05;

/** Nombre maximum d'éléments à tester avant d'abandonner */
const MAX_ELEMENTS_TO_TEST = 50;

/** Tolérance en pixels sur la taille affichée de l'élément (rendu jamais strictement identique) */
const SIZE_TOLERANCE_PX = 4;

/** Nombre de passes de recherche (une image peut être en lazy-loading ou pas encore rendue) */
const SEARCH_ATTEMPTS = 3;

/** Délai entre deux passes de recherche */
const RETRY_DELAY_MS = 700;

/** Budget de temps par passe, pour rester sous le timeout du player (30s) */
const SEARCH_TIME_BUDGET_MS = 7000;

/** Timeout de chargement d'une image */
const IMAGE_LOAD_TIMEOUT_MS = 5000;

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * Attend qu'une image soit complètement chargée sans écraser les handlers de la page
 */
function waitForImageLoaded(element: HTMLImageElement): Promise<void> {
  if (element.complete && element.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener('load', onLoad);
      element.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Erreur lors du chargement de l'image"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout lors du chargement de l'image"));
    }, IMAGE_LOAD_TIMEOUT_MS);

    element.addEventListener('load', onLoad);
    element.addEventListener('error', onError);
  });
}

/**
 * Recharge une image en mode CORS anonyme pour pouvoir la dessiner dans un canvas
 * (utilisé quand l'image d'origine "tainte" le canvas)
 */
function loadImageWithCors(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Image sans source exploitable'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Timeout lors du rechargement CORS')), IMAGE_LOAD_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Image protégée par CORS : capture impossible'));
    };
    img.src = src;
  });
}

function drawToDataUrl(source: CanvasImageSource, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Impossible d'obtenir le contexte du canvas");
  }
  ctx.drawImage(source, 0, 0, width, height);
  // Lève une SecurityError si le canvas est "tainted" par une image cross-origin
  return canvas.toDataURL('image/png');
}

/**
 * Convertit un élément HTML en image base64
 */
export async function convertElementToBase64(element: HTMLElement): Promise<string> {
  if (element instanceof HTMLImageElement) {
    // Vérification que l'image est complètement chargée
    await waitForImageLoaded(element);

    // Utilisation de naturalWidth et naturalHeight pour éviter les distorsions
    const width = element.naturalWidth || element.clientWidth;
    const height = element.naturalHeight || element.clientHeight;
    if (!width || !height) {
      throw new Error('Image sans dimensions exploitables');
    }

    try {
      return drawToDataUrl(element as unknown as CanvasImageSource, width, height);
    } catch {
      // Canvas "tainted" : l'image vient d'un autre domaine sans en-tête CORS.
      // On retente avec une copie chargée en anonymous (fonctionne si le serveur renvoie Access-Control-Allow-Origin)
      const corsImage = await loadImageWithCors(element.currentSrc || element.src);
      return drawToDataUrl(corsImage as unknown as CanvasImageSource, corsImage.naturalWidth, corsImage.naturalHeight);
    }
  } else {
    // Utilisation de dom-to-image pour les autres éléments HTML
    try {
      return await domtoimage.toPng(element);
    } catch (error) {
      throw new Error("Erreur lors de la conversion de l'élément HTML en image");
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCacheKey(action: IUserAction): string {
  return `${window.location.href}|${action.value}`;
}

/**
 * Recherche une image dans le DOM correspondant à l'action
 * Plusieurs passes sont effectuées : l'image peut être en lazy-loading ou pas encore rendue
 */
export async function searchImg(action: IUserAction): Promise<HTMLElement> {
  // Vérifier le cache (en s'assurant que l'élément est toujours dans le document)
  const cacheKey = getCacheKey(action);
  const cached = cache.get(cacheKey);
  if (cached) {
    if (document.contains(cached)) {
      return cached;
    }
    cache.delete(cacheKey);
  }

  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAY_MS);
    }

    const result = await searchInDomOptimized(action);
    if (result) {
      cache.set(cacheKey, result);
      return result;
    }
  }

  throw new Error('Image introuvable');
}

/**
 * Recherche optimisée : s'arrête dès qu'une correspondance est trouvée
 * au lieu d'attendre toutes les comparaisons
 */
async function searchInDomOptimized(action: IUserAction): Promise<HTMLElement | null> {
  const candidates = findCandidates(action);

  // Limiter le nombre d'éléments à tester pour éviter les blocages
  const elementsToTest = candidates.slice(0, MAX_ELEMENTS_TO_TEST);

  if (candidates.length > MAX_ELEMENTS_TO_TEST) {
    console.warn(`Tuello: trop d'éléments candidats (${candidates.length}), limité à ${MAX_ELEMENTS_TO_TEST}`);
  }

  const deadline = Date.now() + SEARCH_TIME_BUDGET_MS;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestElement: HTMLElement | null = null;
  let tested = 0;

  // Tester les éléments séquentiellement et s'arrêter au premier match
  for (const element of elementsToTest) {
    if (Date.now() > deadline) {
      console.warn(`Tuello: budget de recherche dépassé après ${tested} élément(s) testé(s)`);
      break;
    }

    try {
      const dataUrl = await convertElementToBase64(element);
      const { difference, rescaled } = await compareImages(action.value, dataUrl);
      tested++;

      if (difference < bestScore) {
        bestScore = difference;
        bestElement = element;
      }

      const threshold = rescaled ? RESCALED_MATCH_THRESHOLD_PERCENT : MATCH_THRESHOLD_PERCENT;
      if (difference < threshold) {
        return element;
      }
    } catch (error) {
      // Ignorer les erreurs de conversion et passer à l'élément suivant
      console.warn('Tuello: erreur conversion élément:', error);
    }
  }

  logSearchFailure(action, candidates.length, tested, bestScore, bestElement);

  return null;
}

/**
 * Trace détaillée en cas d'échec : c'est ce qui permet de distinguer
 * un problème de sélection des candidats d'un problème de rendu de l'image
 */
function logSearchFailure(action: IUserAction, candidateCount: number, tested: number, bestScore: number, bestElement: HTMLElement | null): void {
  let referenceSize = 'illisible';
  try {
    const reference = readPng(action.value);
    referenceSize = `${reference.width}x${reference.height}`;
  } catch {
    // on garde 'illisible' : l'image enregistrée elle-même pose problème
  }

  console.warn('Tuello: aucune correspondance trouvée pour cette image', {
    candidats: candidateCount,
    testés: tested,
    meilleurÉcart: Number.isFinite(bestScore) ? `${bestScore.toFixed(2)}%` : 'n/a',
    meilleurÉlément: bestElement ? `${bestElement.tagName.toLowerCase()} ${bestElement.clientWidth}x${bestElement.clientHeight}` : 'aucun',
    tailleAffichéeRecherchée: `${action.clientWidth}x${action.clientHeight}`,
    tailleImageEnregistrée: referenceSize,
    typeEnregistré: action.imageType ?? 'non défini',
    nbImagesDansLaPage: document.images.length,
    url: window.location.href
  });
}

/**
 * pixelmatch construit une vue Uint32Array sur le buffer : l'offset doit être aligné sur 4 octets
 */
function toAlignedPixels(data: Uint8Array): Uint8Array {
  if (data.byteOffset % 4 === 0) {
    return data;
  }
  return new Uint8Array(data);
}

/**
 * Redimensionne un buffer RGBA (plus proche voisin) pour permettre la comparaison
 * de deux rendus d'une même image servie à des résolutions différentes
 */
function resizeRgba(data: Uint8Array, srcWidth: number, srcHeight: number, width: number, height: number): Uint8Array {
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

function readPng(dataUrl: string): { data: Uint8Array; width: number; height: number } {
  const base64 = dataUrl.startsWith(PNG_DATA_URL_PREFIX) ? dataUrl.slice(PNG_DATA_URL_PREFIX.length) : dataUrl.slice(dataUrl.indexOf(',') + 1);
  const png = PNG.sync.read(Buffer.from(base64, 'base64'));
  return { data: png.data, width: png.width, height: png.height };
}

/**
 * Compare deux images et retourne le pourcentage de différence
 * ainsi que l'information "l'image candidate a dû être redimensionnée"
 */
async function compareImages(dataUrl1: string, dataUrl2: string): Promise<{ difference: number; rescaled: boolean }> {
  try {
    const reference = readPng(dataUrl1);
    const candidate = readPng(dataUrl2);

    const width = reference.width;
    const height = reference.height;
    let candidateData = candidate.data;
    let rescaled = false;

    if (candidate.width !== width || candidate.height !== height) {
      // Les dimensions diffèrent (srcset, densité d'écran, zoom...) : on normalise
      // au lieu de rejeter d'emblée, sauf si le ratio n'a rien à voir
      const referenceRatio = width / height;
      const candidateRatio = candidate.width / candidate.height;
      if (Math.abs(referenceRatio - candidateRatio) > ASPECT_RATIO_TOLERANCE) {
        return { difference: 100, rescaled: false };
      }
      candidateData = resizeRgba(candidate.data, candidate.width, candidate.height, width, height);
      rescaled = true;
    }

    // Passer null comme buffer de sortie : on n'a besoin que du nombre de pixels différents,
    // pas de l'image diff. Évite l'allocation d'un PNG (~1.9 MB pour 800×600).
    const mismatchedPixels = pixelmatch(
      toAlignedPixels(reference.data),
      toAlignedPixels(candidateData),
      null,
      width,
      height,
      { threshold: 0.1 } // Tolérance pour les différences mineures de rendu
    );

    const totalPixels = width * height;
    return { difference: (mismatchedPixels / totalPixels) * 100, rescaled };
  } catch (err) {
    console.warn('Tuello: erreur comparaison images:', err);
    return { difference: 100, rescaled: false };
  }
}

function sizeDistance(element: HTMLElement, action: IUserAction): number {
  return Math.abs(element.clientWidth - action.clientWidth) + Math.abs(element.clientHeight - action.clientHeight);
}

function hasExpectedSize(element: HTMLElement, action: IUserAction): boolean {
  // Anciens enregistrements sans taille : on ne filtre pas
  if (action.clientWidth === undefined || action.clientHeight === undefined) {
    return true;
  }
  return Math.abs(element.clientWidth - action.clientWidth) <= SIZE_TOLERANCE_PX && Math.abs(element.clientHeight - action.clientHeight) <= SIZE_TOLERANCE_PX;
}

function sortBySizeProximity(elements: HTMLElement[], action: IUserAction): HTMLElement[] {
  if (action.clientWidth === undefined || action.clientHeight === undefined) {
    return elements;
  }
  return [...elements].sort((a, b) => sizeDistance(a, action) - sizeDistance(b, action));
}

/**
 * Construit la liste ordonnée des éléments à comparer.
 * On exploite le type d'image enregistré (balise img ou background CSS) pour tester
 * en premier les éléments les plus probables, puis on élargit progressivement.
 */
export function findCandidates(action: IUserAction): HTMLElement[] {
  const allElements = Array.from(document.body.getElementsByTagName('*')).filter((element): element is HTMLElement => element instanceof HTMLElement);

  const images = allElements.filter((element) => element instanceof HTMLImageElement);
  const backgrounds = allElements.filter((element) => !(element instanceof HTMLImageElement) && window.getComputedStyle(element).backgroundImage !== 'none');

  const isBackground = action.imageType === ImageType.BACKGROUND;

  // Groupes du plus probable au moins probable. Le dernier groupe ignore la taille :
  // une image lazy-loadée ou responsive peut être rendue à une taille différente.
  const groups: HTMLElement[][] = isBackground
    ? [backgrounds.filter((e) => hasExpectedSize(e, action)), images.filter((e) => hasExpectedSize(e, action)), allElements.filter((e) => hasExpectedSize(e, action)), backgrounds]
    : [images.filter((e) => hasExpectedSize(e, action)), backgrounds.filter((e) => hasExpectedSize(e, action)), allElements.filter((e) => hasExpectedSize(e, action)), images];

  const ordered: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const group of groups) {
    for (const element of sortBySizeProximity(group, action)) {
      if (!seen.has(element)) {
        seen.add(element);
        ordered.push(element);
      }
    }
  }

  return ordered;
}

/**
 * Trouve l'élément image sous le curseur (hover)
 */
export function findImageHover(): HTMLElement | null {
  const hoveredElements = document.querySelectorAll(':hover');

  if (!hoveredElements || hoveredElements.length === 0) {
    return null;
  }

  const lastHovered = hoveredElements[hoveredElements.length - 1];

  // Vérifier si c'est une balise img
  if (lastHovered.nodeName.toLowerCase() === 'img') {
    return lastHovered as HTMLImageElement;
  }

  const hoveredArray = Array.from(hoveredElements).reverse() as HTMLElement[];

  // Une img peut être survolée sans être le dernier élément (overlay, lien englobant...)
  const hoveredImage = hoveredArray.find((element) => element instanceof HTMLImageElement);
  if (hoveredImage) {
    return hoveredImage;
  }

  // Chercher un élément avec une image en background (style calculé, pas seulement inline)
  for (const element of hoveredArray) {
    if (window.getComputedStyle(element).backgroundImage !== 'none') {
      return element;
    }
  }

  // Retourner l'élément le plus profond par défaut
  return hoveredArray[0];
}

/**
 * Vide le cache des images
 */
export function clearImageCache(): void {
  cache.clear();
}
