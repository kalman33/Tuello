import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { PNG } from 'pngjs/browser';
import pixelmatch from "pixelmatch";
import { Buffer } from 'buffer';
import domtoimage from 'dom-to-image';

/** Cache des images trouvées pour éviter les recherches répétées */
const cache: Map<string, HTMLElement> = new Map();

/** Seuil de correspondance (5% de différence max) */
const MATCH_THRESHOLD_PERCENT = 5;

/** Nombre maximum d'éléments à tester avant d'abandonner */
const MAX_ELEMENTS_TO_TEST = 50;

/**
 * Convertit un élément HTML en image base64
 */
export async function convertElementToBase64(element: HTMLElement): Promise<string> {
  if (element instanceof HTMLImageElement) {
    // Vérification que l'image est complètement chargée
    if (!element.complete) {
      await new Promise<void>((resolve, reject) => {
        element.onload = () => resolve();
        element.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
      });
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Impossible d'obtenir le contexte du canvas");
    }

    // Utilisation de naturalWidth et naturalHeight pour éviter les distorsions
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;

    ctx.drawImage(element as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } else {
    // Utilisation de dom-to-image pour les autres éléments HTML
    try {
      return await domtoimage.toPng(element);
    } catch (error) {
      throw new Error("Erreur lors de la conversion de l'élément HTML en image");
    }
  }
}

/**
 * Recherche une image dans le DOM correspondant à l'action
 * Utilise un cache pour éviter les recherches répétées
 */
export async function searchImg(action: IUserAction): Promise<HTMLElement> {
  // Vérifier le cache
  const cacheKey = action.value;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const result = await searchInDomOptimized(action);

  if (result) {
    cache.set(cacheKey, result);
    return result;
  }

  throw new Error('Image introuvable');
}

/**
 * Recherche optimisée : s'arrête dès qu'une correspondance est trouvée
 * au lieu d'attendre toutes les comparaisons
 */
async function searchInDomOptimized(action: IUserAction): Promise<HTMLElement | null> {
  const candidates = findElementsBySize(action);

  // Limiter le nombre d'éléments à tester pour éviter les blocages
  const elementsToTest = candidates.slice(0, MAX_ELEMENTS_TO_TEST);

  if (candidates.length > MAX_ELEMENTS_TO_TEST) {
    console.warn(`Trop d'éléments candidats (${candidates.length}), limité à ${MAX_ELEMENTS_TO_TEST}`);
  }

  // Tester les éléments séquentiellement et s'arrêter au premier match
  for (const element of elementsToTest) {
    try {
      const dataUrl = await convertElementToBase64(element);
      const isMatch = await compareImages(action.value, dataUrl);

      if (isMatch) {
        return element;
      }
    } catch (error) {
      // Ignorer les erreurs de conversion et passer à l'élément suivant
      console.warn('Erreur conversion élément:', error);
    }
  }

  return null;
}

/**
 * Compare deux images et retourne true si elles correspondent
 * (moins de MATCH_THRESHOLD_PERCENT% de différence)
 */
async function compareImages(dataUrl1: string, dataUrl2: string): Promise<boolean> {
  try {
    const pngImg1 = PNG.sync.read(Buffer.from(dataUrl1.slice('data:image/png;base64,'.length), 'base64'));
    const pngImg2 = PNG.sync.read(Buffer.from(dataUrl2.slice('data:image/png;base64,'.length), 'base64'));

    // Vérifier que les dimensions correspondent
    if (pngImg1.width !== pngImg2.width || pngImg1.height !== pngImg2.height) {
      return false;
    }

    const diffImage = new PNG({ width: pngImg1.width, height: pngImg1.height });

    const mismatchedPixels = pixelmatch(
      pngImg1.data,
      pngImg2.data,
      diffImage.data,
      pngImg1.width,
      pngImg1.height,
      { threshold: 0.1 } // Tolérance pour les différences mineures de rendu
    );

    const totalPixels = pngImg1.width * pngImg1.height;
    const misMatchPercentage = (mismatchedPixels / totalPixels) * 100;

    // Tolérance pour les variations de rendu (anti-aliasing, compression, etc.)
    return misMatchPercentage < MATCH_THRESHOLD_PERCENT;
  } catch (err) {
    console.warn('Erreur comparaison images:', err);
    return false;
  }
}

/**
 * Trouve tous les éléments HTML ayant la même taille que l'action
 */
export function findElementsBySize(action: IUserAction): HTMLElement[] {
  const elements = document.body.getElementsByTagName("*");

  return Array.from(elements).filter((element): element is HTMLElement => {
    return element instanceof HTMLElement &&
           action.clientHeight === element.clientHeight &&
           action.clientWidth === element.clientWidth;
  });
}

/**
 * Trouve l'élément image sous le curseur (hover)
 */
export function findImageHover(): HTMLElement | null {
  const hoveredElements = document.querySelectorAll(":hover");

  if (!hoveredElements || hoveredElements.length === 0) {
    return null;
  }

  const lastHovered = hoveredElements[hoveredElements.length - 1];

  // Vérifier si c'est une balise img
  if (lastHovered.nodeName.toLowerCase() === 'img') {
    return lastHovered as HTMLImageElement;
  }

  // Chercher un élément avec une image en background
  const hoveredArray = Array.from(hoveredElements).reverse();
  for (const element of hoveredArray.slice(1)) {
    const htmlElement = element as HTMLElement;
    if (htmlElement.style.backgroundImage !== '') {
      return htmlElement;
    }
  }

  // Retourner le premier élément par défaut
  return hoveredArray[0] as HTMLElement;
}

/**
 * Vide le cache des images
 */
export function clearImageCache(): void {
  cache.clear();
}
