import { ImageType, IUserAction } from '../../../src/app/spy-http/models/UserAction';
import domtoimage from 'dom-to-image';
import { comparePngDataUrls, readPng } from './imageCompare';

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

/**
 * Empreinte FNV-1a : la clé de cache portait tout le base64 de l'image (plusieurs
 * dizaines de Ko), rehashé à chaque accès à la Map.
 */
function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function getCacheKey(action: IUserAction): string {
  const value = action.value ?? '';
  return `${window.location.href}|${value.length}|${hashString(value)}`;
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
  // La limite est passée à findCandidates : inutile de construire (et de calculer le
  // style de) toute la page pour n'en tester que MAX_ELEMENTS_TO_TEST.
  const elementsToTest = findCandidates(action, MAX_ELEMENTS_TO_TEST);

  if (elementsToTest.length === MAX_ELEMENTS_TO_TEST) {
    console.warn(`Tuello: recherche limitée aux ${MAX_ELEMENTS_TO_TEST} éléments les plus probables`);
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
      const { difference, rescaled } = compareImages(action.value, dataUrl);
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

  logSearchFailure(action, elementsToTest.length, tested, bestScore, bestElement);

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
 * Compare deux images et retourne le pourcentage de différence
 * ainsi que l'information "l'image candidate a dû être redimensionnée"
 */
function compareImages(dataUrl1: string, dataUrl2: string): { difference: number; rescaled: boolean } {
  try {
    // Pas d'image de différence : on n'a besoin que du pourcentage, générer le PNG
    // de diff coûterait une allocation par élément testé.
    const result = comparePngDataUrls(dataUrl1, dataUrl2, {
      threshold: 0.1,
      aspectRatioTolerance: ASPECT_RATIO_TOLERANCE
    });
    return { difference: result.differencePercent, rescaled: result.rescaled };
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
export function findCandidates(action: IUserAction, limit = Number.POSITIVE_INFINITY): HTMLElement[] {
  const allElements = Array.from(document.body.getElementsByTagName('*')).filter((element): element is HTMLElement => element instanceof HTMLElement);

  const isImage = (element: HTMLElement): boolean => element instanceof HTMLImageElement;

  // getComputedStyle force un recalcul de style : on ne l'appelle que sur les éléments
  // réellement examinés, et une seule fois par élément.
  const backgroundCache = new Map<HTMLElement, boolean>();
  const hasBackgroundImage = (element: HTMLElement): boolean => {
    if (isImage(element)) {
      return false;
    }
    let result = backgroundCache.get(element);
    if (result === undefined) {
      result = window.getComputedStyle(element).backgroundImage !== 'none';
      backgroundCache.set(element, result);
    }
    return result;
  };

  // Le filtrage par taille ne lit que clientWidth/clientHeight : c'est le filtre le
  // moins cher, on le passe en premier.
  const sizeMatching = allElements.filter((element) => hasExpectedSize(element, action));

  const isBackground = action.imageType === ImageType.BACKGROUND;

  // Groupes du plus probable au moins probable, évalués paresseusement : dès que la
  // limite est atteinte, les groupes suivants ne sont jamais construits. Le dernier
  // groupe ignore la taille : une image lazy-loadée ou responsive peut être rendue à
  // une taille différente.
  const groups: Array<() => HTMLElement[]> = isBackground
    ? [() => sizeMatching.filter(hasBackgroundImage), () => sizeMatching.filter(isImage), () => sizeMatching, () => allElements.filter(hasBackgroundImage)]
    : [() => sizeMatching.filter(isImage), () => sizeMatching.filter(hasBackgroundImage), () => sizeMatching, () => allElements.filter(isImage)];

  const ordered: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const group of groups) {
    if (ordered.length >= limit) {
      break;
    }
    for (const element of sortBySizeProximity(group(), action)) {
      if (!seen.has(element)) {
        seen.add(element);
        ordered.push(element);
        if (ordered.length >= limit) {
          break;
        }
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
