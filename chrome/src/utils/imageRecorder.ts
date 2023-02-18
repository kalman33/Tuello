import html2canvas from 'html2canvas';
import { crop, getOffset } from './utils';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import resemble from 'resemblejs';

/**
 * permet de recuperer l'image
 */
export function recordImg(element: HTMLElement): Promise<string> {
  return new Promise((resolve, reject) => {
    html2canvas(document.body, { scale: 1 }).then((canvas: HTMLCanvasElement) => {
      const domRec = element.getBoundingClientRect();
      const dataUrl = crop(canvas, getOffset(element).left, getOffset(element).top, domRec.width.toFixed(2), domRec.height.toFixed(2));
      resolve(dataUrl);
    });
  });
}

export function searchImg(action: IUserAction): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    html2canvas(document.body, { scale: 1 }).then((canvas: HTMLCanvasElement) => {
      // on liste toutes les images de la page
      searchInDom(canvas, action).then(values => {
        const imgFinded = values.find(val => val !== 'not founded');
        const imgs = Array.from(document.images).map(img => {
          const dataURL = crop(canvas, getOffset(img).left, getOffset(img).top, img.width, img.height);
          return {img, dataURL};
        });
        const res = imgs.find(val => {
          return val.dataURL === imgFinded;
        });
        return res ? resolve(res['img']) : reject('Image introuvable');
      });
    });
  });
}

function searchInDom(canvas, action) {
  const promiseArray = Array.from(document.images).map(async img => {
    const dataUrl = crop(canvas, getOffset(img).left, getOffset(img).top, img.width, img.height);
    return await compareImages(action.value, dataUrl);
  });
  return Promise.all(promiseArray);
}

async function compareImages(img1, img2) {
  return new Promise((resolve, reject) => {
    resemble(img1)
      .compareTo(img2)
      .ignoreColors()
      .onComplete(data => {
        if (data.rawMisMatchPercentage < 0.1) {
          resolve(img2);
        } else {
          resolve('not founded');
        }
      });
  });
}

export function findImage(): HTMLElement {
  const elts: NodeListOf<Element> = document.querySelectorAll( ":hover" );
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

    }
    
    return null;
  }
} 
