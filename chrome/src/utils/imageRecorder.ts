import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
// import { PNG } from 'pngjs/browser';
// import pixelmatch from "pixelmatch";
// import { Buffer } from 'buffer';
// import html2canvas from 'html2canvas';
import domtoimage from 'dom-to-image';

export async function convertElementToBase64(element: HTMLElement): Promise<string> {
  return new Promise((resolve, reject) => {
    if (element instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = element.clientWidth;
      canvas.height = element.clientHeight;

      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png')); // Vous pouvez changer le format de l'image si nécessaire
     } else {
      resolve(domtoimage.toPng(element));
    }
  });
}

export function searchImg(action: IUserAction): Promise<(HTMLElement | string)> {
  return new Promise((resolve, reject) => {
    searchInDom(action).then(values => {
      const imgFinded = values.find(val => val !== 'not founded');

      if (imgFinded) {
        return resolve(imgFinded);
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

async function compareImages(dataurl1, dataurl2, img): Promise<HTMLElement | string> {
  return new Promise((resolve) => {
    try {
      /**const pngImg1 = PNG.sync.read(Buffer.from(dataurl1.slice('data:image/png;base64,'.length), 'base64'));
      const pngImg2 = PNG.sync.read(Buffer.from(dataurl2.slice('data:image/png;base64,'.length), 'base64'));
      const diffImage = new PNG({ width: pngImg1.width, height: pngImg1.height });

      const mismatchedPixels = pixelmatch(
        pngImg1.data,
        pngImg2.data,
        diffImage.data,
        pngImg1.width,
        pngImg1.height,
        {}
      );

      const match = 1 - mismatchedPixels / (pngImg1.width * pngImg1.height);
      const misMatchPercentage = 100 - (match * 100);

      if (misMatchPercentage < 0.1) {
        resolve(img);
      } else {
        resolve('not founded');
      }*/
     if (dataurl1 === dataurl2) {
      resolve(img);
     } else {
      resolve('not founded');
     }
    } catch (err) {
      resolve('not founded');
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


