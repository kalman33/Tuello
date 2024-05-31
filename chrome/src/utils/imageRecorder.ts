import html2canvas from 'html2canvas';
import { crop, getOffset } from './utils';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { PNG } from 'pngjs/browser';
import pixelmatch from "pixelmatch";
import { Buffer } from 'buffer';

export function convertImageToBase64(imageElement: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;

    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/png')); // Vous pouvez changer le format de l'image si nécessaire
  });
}

export function searchImg(action: IUserAction): Promise<(HTMLElement | string)> {
  return new Promise((resolve, reject) => {
    html2canvas(document.body, { scale: 1 }).then((canvas: HTMLCanvasElement) => {
      // on liste toutes les images de la page
      searchInDom(canvas, action).then(values => {
        const imgFinded = values.find(val => val !== 'not founded');

        if (imgFinded) {
          return resolve(imgFinded);
        }
        return reject('Image introuvable');
      });
    });
  })
}

function searchInDom(canvas, action): Promise<(HTMLElement | string)[]> {
  const promiseArray = findImages().map(async img => {
    const dataUrl = crop(canvas, getOffset(img).left, getOffset(img).top, img.offsetWidth, img.offsetHeight);
    return await compareImages(action.value, dataUrl, img)
  });
  return Promise.all(promiseArray);
}

async function compareImages(dataurl1, dataurl2, img): Promise<HTMLElement | string> {
  return new Promise((resolve, reject) => {
    try {
      let pngImg1 = PNG.sync.read(Buffer.from(dataurl1.slice('data:image/png;base64,'.length), 'base64'));
      let pngImg2 = PNG.sync.read(Buffer.from(dataurl2.slice('data:image/png;base64,'.length), 'base64'));
      let diffImage = new PNG({
        width: pngImg1.width,
        height: pngImg1.height
      });


      // pixelmatch returns the number of mismatched pixels
      const mismatchedPixels = pixelmatch(
        pngImg1.data,
        pngImg2.data,
        diffImage.data, // output
        pngImg1.width,
        pngImg1.height,
        {} // options
      );

      const match = 1 - mismatchedPixels / (pngImg1.width * pngImg1.height);
      const misMatchPercentage = 100 - (match * 100)

      if (misMatchPercentage < 0.1) {
        resolve(img);
      } else {
        resolve('not founded');
      }
    }
    catch (err) {
      resolve('not founded');
    };
  });
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

    }

    return null;
  }
}

export function findImages(): HTMLElement[] {
  let images = Array.from(document.images) || <HTMLElement[]>[];
  const elements = document.body.getElementsByTagName("*");
  Array.from(elements).map(el => {
    var style = window.getComputedStyle(el, null);
    if (style.backgroundImage != "none") {
      images.push((el as HTMLElement));
    }
  });
  return images;
}

