import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { PNG } from 'pngjs/browser';
import pixelmatch from "pixelmatch";
import { Buffer } from 'buffer';
import domtoimage from 'dom-to-image';

const cache: { [key: string]: HTMLElement | string } = {};

export async function convertElementToBase64(element: HTMLElement): Promise<string> {
  if (element instanceof HTMLImageElement) {
    // Vérification que l'image est complètement chargée
    if (!element.complete) {
      // Attendre que l'image soit chargée avant de la dessiner
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


export function searchImg(action: IUserAction): Promise<(HTMLElement | string)> {
  return new Promise((resolve, reject) => {
    // Vérifiez si le résultat est déjà dans le cache
    if (action.value in cache) {
      return resolve(cache[action.value]);
    }

    searchInDom(action).then(values => {
      const imgFound = values.find(val => val !== 'not found');

      if (imgFound) {
        cache[action.value] = imgFound;
        return resolve(imgFound);
      }
      return reject('Image introuvable');
    });
  });
}

function searchInDom(action): Promise<(HTMLElement | string)[]> {
  const promiseArray = findElementsBySize(action).map(async img => {
    const dataUrl = await convertElementToBase64(img);
    return await compareImages(action.value, dataUrl, img);
  });
  return Promise.all(promiseArray);
}

async function compareImages(dataUrl1: string, dataUrl2: string, img: HTMLElement): Promise<HTMLElement | string> {
  return new Promise((resolve) => {
    try {
      const pngImg1 = PNG.sync.read(Buffer.from(dataUrl1.slice('data:image/png;base64,'.length), 'base64'));
      const pngImg2 = PNG.sync.read(Buffer.from(dataUrl2.slice('data:image/png;base64,'.length), 'base64'));

      // Vérifier que les dimensions correspondent
      if (pngImg1.width !== pngImg2.width || pngImg1.height !== pngImg2.height) {
        resolve('not found');
        return;
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

      const match = 1 - mismatchedPixels / (pngImg1.width * pngImg1.height);
      const misMatchPercentage = 100 - (match * 100);

      // Tolérance de 5% pour les variations de rendu (anti-aliasing, compression, etc.)
      if (misMatchPercentage < 5) {
        resolve(img);
      } else {
        resolve('not found');
      }
    } catch (err) {
      console.warn('Erreur comparaison images:', err);
      resolve('not found');
    }
  });
}



function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // This is necessary if the image is from a different origin
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image from ${url}`));
    img.src = url;
  });
}

/** 
export function findImages(): HTMLElement[] {
  let images = Array.from(document.images) as HTMLElement[];
  const elements = document.body.getElementsByTagName("*");
  Array.from(elements).forEach(el => {
    const style = window.getComputedStyle(el, null);
    if (style.backgroundImage !== "none" && style.backgroundImage.startsWith('url(')) {
      images.push(el as HTMLElement);
    }
  });
  return images;
}*/

export function findElementsBySize(action: IUserAction): HTMLElement[] {
  const elements = document.body.getElementsByTagName("*");
  return Array.from(elements).filter((element) : element is HTMLElement => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      return element instanceof HTMLElement && action.clientHeight === element.clientHeight && action.clientWidth === element.clientWidth;
  })
}


export function findImageHover(): HTMLElement {
  const elts: NodeListOf<Element> = document.querySelectorAll(":hover");
  if (elts && elts.length > 0) {
    if (elts[elts.length - 1].nodeName.toLowerCase() === 'img') {

      return (elts[elts.length - 1] as HTMLImageElement);
    } else {
      // on commence à rechercher une image en background
      var eltsArr = Array.from(elts);
      for (const element of eltsArr.reverse().slice(1)) {
        if ((element as HTMLElement).style.backgroundImage !== '') {

          return (element as HTMLElement);
        }
      };
      // c'est pas une image
      return (eltsArr[0] as HTMLElement);
    }
  }
}


