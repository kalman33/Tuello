/**
 * Listener des post message provenant de contentscript
 */
import { UserAction } from './models/UserAction';
import * as lightboxImg from './utils/imageviewer';
import { findImage, recordImg } from './utils/imageRecorder';
import { ImageType } from '../../src/app/spy-http/models/UserAction';

let frame;

function listAllEventListeners() {
  const allElements = Array.prototype.slice.call(document.querySelectorAll('*'));
  allElements.push(document);
  allElements.push(window);

  const types = [];

  for (const ev in window) {
    if (/^on/.test(ev)) {
      types[types.length] = ev;
    }
  }

  const elements = [];
  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < allElements.length; i++) {
    const currentElement = allElements[i];
    // tslint:disable-next-line:prefer-for-of
    for (let j = 0; j < types.length; j++) {
      if (typeof currentElement[types[j]] === 'function') {
        elements.push({
          node: currentElement,
          type: types[j],
          func: currentElement[types[j]].toString()
        });
      }
    }
  }

  return elements.sort((a, b) => {
    return a.type.localeCompare(b.type);
  });
}
removeEventListener('message', uiRecorderEventListener);
addEventListener('message', uiRecorderEventListener);

function uiRecorderEventListener(event) {
  // si on est en devtools, on valorise l'index de l'iframe ou -1 si on est en top
  if (window['TuelloFrameIndex'] !== undefined) {
    frame = {
      frameIndex: window['TuelloFrameIndex']
    };
  }
  if (event.data.type && event.data.type === 'UI_RECORDER_ACTIVATED') {
    if (event.data.value) {
      if (window.self === window.top) {
        window.postMessage(
          {
            type: 'RECORD_WINDOW_SIZE'
          },
          '*'
        );
      }
      // on crée un event de scroll si l'utilisateur n'est pas en haut de la page
      if ((window as any).scrollX !== 0 || (window as any).scrollY !== 0) {
        window.postMessage(
          {
            type: 'RECORD_USER_ACTION',
            value: {
              scrollX: (window as any).scrollX,
              scrollY: (window as any).scrollY,
              type: 'scroll',
              frame
            }
          },
          '*'
        );
      }
      addListeners();
    } else {
      removeListeners();
    }
  }
  if (event.data.type && event.data.type === 'VIEW_IMAGE') {
    lightboxImg.open(event.data.value);
  }
}

function removeListeners() {
  document.removeEventListener('keydown', keyboardListener);
  document.removeEventListener('click', listener);
  document.removeEventListener('scroll', listener);
  document.removeEventListener('input', listener);
  // document.removeEventListener('change', listener); // select
  document.removeEventListener('mousedown', mousedownListener);
  window.removeEventListener('resize', resizeListener);
}

function addListeners() {
  // remove listeners pour etre sur qu'il y en ai pas deux
  removeListeners();

  document.addEventListener('keydown', keyboardListener, true);
  document.addEventListener('click', listener, true);
  document.addEventListener('scroll', listener, true);
  document.addEventListener('input', listener, true);
  // document.addEventListener('change', listener); // select
  document.addEventListener('mousedown', mousedownListener, true);
  window.addEventListener('resize', resizeListener, true);
}

function listener(e) {
  if (e.shiftKey && e.altKey) {
    recordImage(false);
  } else {
    const useraction = new UserAction(e);
    useraction.frame = frame;
    window.postMessage(
      {
        type: 'RECORD_USER_ACTION',
        value: useraction
      },
      '*'
    );
  }
}

function keyboardListener(e) {
  if (e.altKey && e.shiftKey && (e.key === 'S' || e.code === 'KeyS')) {
    window.postMessage(
      {
        type: 'SCREENSHOT_ACTION'
      },
      '*'
    );

    return false;
  } else if (e.altKey && e.shiftKey && (e.key === 'C' || e.code === 'KeyC')) {
    window.postMessage(
      {
        type: 'COMMENT_ACTION'
      },
      '*'
    );

    return false;
  } else if (e.altKey && e.shiftKey && (e.key === 'I' || e.code === 'KeyI')) {
    recordImage(true);
  } else if (e.key === 'Enter' && e.target.tagName && e.target.tagName.toLowerCase() === 'input') {
    const action = new UserAction(null);
    action.type = 'enterKey';
    // getBoundingClientRect : method returns the size of an element and its position relative to the viewport.
    const rect = (e.target as any).getBoundingClientRect();
    action.x = Math.ceil(rect.left + window.scrollX);
    action.y = Math.ceil(rect.top + window.scrollY);
    action.frame = frame;
    window.postMessage(
      {
        type: 'RECORD_USER_ACTION',
        value: action
      },
      '*'
    );
  }
}

function mousedownListener(e) {
  // on surveille qu'il ne s'agise pas d'un click sur un bouton submit car l'event click n'est pas remonté dans ce cas
  if (e.target.tagName && e.target.tagName.toLowerCase() === 'input' && e.target.type && e.target.type.toLowerCase() === 'submit') {
    const useraction = new UserAction(null);
    useraction.type = 'click';
    useraction.x = e.pageX;
    useraction.y = e.pageY;
    useraction.hrefLocation = window.location.href;
    useraction.frame = frame;
    window.postMessage(
      {
        type: 'RECORD_USER_ACTION',
        value: useraction
      },
      '*'
    );
  }

}

function resizeListener() {
  const useraction = new UserAction(null);
  useraction.type = 'resize';
  useraction.hrefLocation = window.location.href;
  useraction.frame = frame;
  window.postMessage(
    {
      type: 'RECORD_USER_ACTION',
      value: useraction
    },
    '*'
  );
}

function recordImage(withClick: boolean) {

  // if (elt && elt.length > 0 && elt[elt.length - 1].nodeName.toLowerCase() === 'img') {
  const elt = findImage();
  if (elt) {
    // const elt = document.querySelectorAll( ":hover" );
    document.getElementById('cover-spin').style.setProperty('display', 'block', 'important');

    // Record by img
    recordImg(elt).then(base64Img => {
      const action = new UserAction(null);
      action.type = 'recordByImg';
      action.value = base64Img;
      action.frame = frame;
      action.imageType = elt instanceof HTMLImageElement ? ImageType.IMG : ImageType.BACKGROUND;
      window.postMessage(
        {
          type: 'RECORD_BY_IMAGE_ACTION',
          value: action
        },
        '*'
      );
      document.getElementById('cover-spin').style.setProperty('display', 'none', 'important');
      // TODO : voir pour enlever ce settimeout : prb pas de retour du postmessage
      if (withClick) {
        setTimeout(() => {
          elt.click();
        }, 200);
      }
    }).catch(() => {
      document.getElementById('cover-spin').style.setProperty('display', 'none', 'important');
    })
  }
}

// indique au contenscript qu'il s'est chargé
window.postMessage(
  {
    type: 'UI_RECORDER_READY'
  },
  '*'
);
