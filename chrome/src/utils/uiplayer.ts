import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { searchImg } from './imageRecorder';
import { displayEffect, getOffset, getParentByTagName } from './utils';

/**
 * Convertit des coordonnées absolues (document) en coordonnées relatives (viewport)
 * Les coordonnées enregistrées incluent le scroll, elementFromPoint attend des coordonnées viewport
 */
function toViewportCoordinates(x: number, y: number): { x: number; y: number } {
  return {
    x: x - window.scrollX,
    y: y - window.scrollY
  };
}

/**
 * Trouve un élément à partir de coordonnées absolues (document)
 */
function getElementAtAbsolutePosition(x: number, y: number): Element | null {
  const viewport = toViewportCoordinates(x, y);
  return document.elementFromPoint(viewport.x, viewport.y);
}

function mouseEvent(event: string, x: number, y: number, key: number) {
  const ev = document.createEvent('MouseEvent');
  const el = getElementAtAbsolutePosition(x, y);
  ev.initMouseEvent(
    event,
    true /* bubble */,
    true /* cancelable */,
    window,
    null,
    x,
    y,
    x,
    y /* coordinates */,
    false,
    false,
    false,
    false /* modifier keys */,
    key,
    null
  );
  if (el) {
    el.dispatchEvent(ev);
  }
}

function mouseup(x: number, y: number, key: number) {
  mouseEvent('mouseup', x, y, key);
}

function scrollTo(scrollX: number, scrollY: number): void {
  window.scrollTo(scrollX, scrollY);
}

function input(x: number, y: number, value: string) {
  const el = getElementAtAbsolutePosition(x, y);
  if (el) {
    (el as HTMLInputElement).value = value;
    // Déclencher les événements pour que les frameworks réactifs détectent le changement
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function enterKeypress(x: number, y: number) {
  const el = getElementAtAbsolutePosition(x, y);
  if (!el) return;

  const form = getParentByTagName(el as HTMLElement, 'form');
  if (form) {
    const inputs = form.querySelectorAll('input[type="submit"], button[type="submit"]');
    for (const input of inputs) {
      (input as HTMLElement).click();
    }
  }
}

export function run(action: IUserAction) {
  return new Promise((resolve, reject) => {
    switch (action.type) {
      case 'click':
        const x = action.x;
        const y = action.y;
        displayEffect(x, y).then(() => {
          mouseEvent('click', x, y, 0);
          resolve(true);
        });
        break;
      case 'mouseup':
        mouseup(action.x, action.y, action.key);
        resolve(true);
        break;
      case 'input':
        input(action.x, action.y, action.value);
        resolve(true);
        break;
      case 'enterKey':
        enterKeypress(action.x, action.y);
        resolve(true);
        break;
      case 'scroll':
        scrollTo(action.scrollX, action.scrollY);
        resolve(true);
        break;
      case 'recordByImg':
        searchImg(action)
          .then(img => {
            if (img instanceof HTMLElement) {
              const offset = getOffset(img);
              displayEffect(img.offsetWidth / 2 + offset.left, img.offsetHeight / 2 + offset.top).then(() => {
                img.click();
                resolve(true);
              });
            } else {
              resolve(false);
            }
          })
          .catch(err => {
            chrome.runtime.sendMessage({
              action: 'PLAY_ACTION_ERROR'
            }, () => reject(false));
          });
        break;
      default:
        resolve(true);
        break;
    }
  });
}
