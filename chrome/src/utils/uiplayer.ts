import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { searchImg } from './imageRecorder';
import { displayEffect, getParentByTagName } from './utils';

function mouseEvent(event: string, x: number, y: number, key: number) {
  const ev = document.createEvent('MouseEvent');
  const el = document.elementFromPoint(x - window.scrollX, y - window.scrollY);
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
  el.dispatchEvent(ev);
}

function mouseup(x: number, y: number, key: number) {
  mouseEvent('mouseup', x, y, key);
}

function scrollTo(scrollX, scrollY) {
  window.scrollTo(scrollX, scrollY);
}

function input(x, y, value) {
  const el = document.elementFromPoint(x - window.pageXOffset, y - window.pageYOffset);
  el['value'] = value;
}

function enterKeypress(x, y) {
  const el = document.elementFromPoint(x, y);
  var inputs = getParentByTagName(el as HTMLElement, 'form');
  for (const input of inputs) {
    if ((input.type.toLowerCase() == "submit")) {
      input.click();
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
        break;
      case 'scroll':
        scrollTo(action.scrollX, action.scrollY);
        resolve(true);
        break;
      case 'recordByImg':
        searchImg(action)
          .then(img => {
            displayEffect(img.width / 2 + img.x, img.height / 2 + img.y).then(() => {
              img.click();
              resolve(true);
            });
          })
          .catch(err => {
            chrome.runtime.sendMessage({
              action: 'PLAY_ACTION_ERROR'
            }, () => reject(false));
          });
        break;
    }
  });
}
