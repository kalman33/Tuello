/**
 * Listener des post message provenant de contentscript
 */
import { ImageType } from '../../src/app/spy-http/models/UserAction';
import { UserAction } from './models/UserAction';
import { convertElementToBase64, findImageHover } from './utils/imageRecorder';
import * as lightbox from './utils/lightbox';
import { recordHttpUserActionListener } from './utils/recordUserActionListener';
import { addcss } from './utils/utils';

let frame;
let screenshotKeyboardShortcut;
let captureImageKeyboardShortcut;
let commentKeyboardShortcut;


export function launchUIRecorderHandler() {
  chrome.storage.local.get(['uiRecordActivated', 'tuelloKeyboardShortcut'], results => {
    if (results.uiRecordActivated) {
      if (results.tuelloKeyboardShortcut) {
        screenshotKeyboardShortcut = results['tuelloKeyboardShortcut']?.screenshot || {key: 'S', code: 'KeyS'}
        captureImageKeyboardShortcut = results['tuelloKeyboardShortcut']?.captureImage ||  {key: 'I', code: 'KeyI'}
        commentKeyboardShortcut = results['tuelloKeyboardShortcut']?.comment?.key  ||  {key: 'C', code: 'KeyC'}
      } else {
        screenshotKeyboardShortcut = {key: 'S', code: 'KeyS'}
        captureImageKeyboardShortcut = {key: 'I', code: 'KeyI'}
        commentKeyboardShortcut = {key: 'C', code: 'KeyC'}

      }
      // on previent background qu'on a démarré le recording
      chrome.runtime.sendMessage({
        action: 'LOAD_UI_RECORDERS',
        value: true
      }, ()=> {});

      // On active le recorder http
      httpRecordUI(true);
      
      // si on est en devtools, on valorise l'index de l'iframe ou -1 si on est en top
      if (window['TuelloFrameIndex'] !== undefined) {
        frame = {
          frameIndex: window['TuelloFrameIndex']
        };
      }

      if (window.self === window.top) {
        chrome.runtime.sendMessage({
          action: 'RECORD_WINDOW_SIZE'
        }, ()=> {});
      }
      // on crée un event de scroll si l'utilisateur n'est pas en haut de la page
      if ((window as any).scrollX !== 0 || (window as any).scrollY !== 0) {
        chrome.runtime.sendMessage({
          action: 'RECORD_USER_ACTION',
          value: {
            scrollX: (window as any).scrollX,
            scrollY: (window as any).scrollY,
            type: 'scroll',
            frame
          }
        },() => {});
      }
      addListeners();
    } else {
      removeListeners();
      //httpRecordUI(false);
    }
  });
}

// permet d'activer le recording d'ui pour la partie http
function httpRecordUI(activation: boolean) {

  window.postMessage(
    {
      type: 'RECORD_HTTP_ACTIVATED',
      value: activation
    },
    '*'
  );
  if (activation) {
    window.addEventListener('message', recordHttpUserActionListener);
  } else {
    window.removeEventListener('message', recordHttpUserActionListener);
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

  document.addEventListener('keydown', keyboardListener);
  document.addEventListener('click', listener);
  document.addEventListener('scroll', listener);
  document.addEventListener('input', listener);
  // document.addEventListener('change', listener); // select
  document.addEventListener('mousedown', mousedownListener);
  window.addEventListener('resize', resizeListener);
}

function listener(e) {
 
  if (e.shiftKey && e.altKey) {
    recordImage(false);
  } else if (e.x !== 0 && e.y !== 0) {
    const useraction = new UserAction(e);
    useraction.frame = frame;
    chrome.runtime.sendMessage({
      action: 'RECORD_USER_ACTION',
      value: useraction
    },() => {});
  }
}

function keyboardListener(e) {

  

  if (e.altKey && e.shiftKey && (e.key === screenshotKeyboardShortcut.key || e.code === screenshotKeyboardShortcut.code)) {
    const isPopupVisible =
            document.getElementById('iframeTuello') && document.getElementById('iframeTuello').style.display !== 'none' ? true : false;
          chrome.runtime.sendMessage(
            {
              action: 'SCREENSHOT_ACTION',
              value: isPopupVisible
            },
            response => {
              lightbox.open({ content: 'Capture OK', autocCloseMs: 800 });
            }
          );

    return false;
  } else if (e.altKey && e.shiftKey && (e.key === commentKeyboardShortcut.key || e.code === commentKeyboardShortcut.code)) {
    chrome.runtime.sendMessage({
      action: 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION',
      value: true
    }, ()=> {});
    chrome.storage.local.get(['messages'], results => {
      let placeholder = 'Add comment';
      let submitButton = 'Submit';

      if (results.messages) {
        const msgs = results.messages.default;
        placeholder = msgs['mmn.record.placeholder'];
        submitButton = msgs['mmn.record.button.submit'];
      }
      addcss(chrome.runtime.getURL('comment.css'));
      const formElt = document.createElement('form');
      formElt.id = 'comment';
      formElt.name = 'comment';
      formElt.onsubmit = lightbox.close;

      const formInputFieldset = document.createElement('fieldset');
      const formTextarea = document.createElement('textarea');
      formTextarea.placeholder = placeholder;
      formTextarea.name = 'inputComment';
      formTextarea.setAttribute('required', '');
      formInputFieldset.appendChild(formTextarea);
      formElt.appendChild(formInputFieldset);

      const formButtonFieldset = document.createElement('fieldset');
      const formButton = document.createElement('button');
      formButton.type = 'submit';
      formButton.innerText = submitButton;
      formButtonFieldset.appendChild(formButton);
      formElt.appendChild(formButtonFieldset);

      lightbox.open({ content: formElt }).then(comment => {
        chrome.runtime.sendMessage(
          {
            action: 'COMMENT_ACTION',
            value: comment
          },
          () => {
            chrome.runtime.sendMessage({
              action: 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION',
              value: false
            }, ()=> {});
          }
        );
      });
    });

    return false;
  } else if (e.altKey && e.shiftKey && (e.key === captureImageKeyboardShortcut.key || e.code === captureImageKeyboardShortcut.code)) {
    recordImage(true);
  } else if (e.key === 'Enter' && e.target.tagName && e.target.tagName.toLowerCase() === 'input') {
    const action = new UserAction(null);
    action.type = 'enterKey';
    // getBoundingClientRect : method returns the size of an element and its position relative to the viewport.
    const rect = (e.target as any).getBoundingClientRect();
    action.x = Math.ceil(rect.left + window.scrollX);
    action.y = Math.ceil(rect.top + window.scrollY);
    action.frame = frame;
    chrome.runtime.sendMessage({
      action: 'RECORD_USER_ACTION',
      value: action
    },() => {});
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
    chrome.runtime.sendMessage({
      action: 'RECORD_USER_ACTION',
      value: useraction
    },() => {});
  }

}

function resizeListener() {
  const useraction = new UserAction(null);
  useraction.type = 'resize';
  useraction.hrefLocation = window.location.href;
  useraction.frame = frame;
  chrome.runtime.sendMessage({
    action: 'RECORD_USER_ACTION',
    value: useraction
  },() => {});
}

function recordImage(withClick: boolean) {

  // if (elt && elt.length > 0 && elt[elt.length - 1].nodeName.toLowerCase() === 'img') {
  const elt = findImageHover();
  if (elt) {
    // const elt = document.querySelectorAll( ":hover" );
    document.getElementById('cover-spin')?.style?.setProperty('display', 'block', 'important');

    // Record by img
    convertElementToBase64((elt as HTMLElement)).then(base64Img => {
      const action = new UserAction(null);
      action.type = 'recordByImg';
      action.value = base64Img;
      action.frame = frame;
      action.clientHeight = elt.clientHeight,
      action.clientWidth = elt.clientWidth
      action.imageType = elt instanceof HTMLImageElement ? ImageType.IMG : ImageType.BACKGROUND;
      chrome.runtime.sendMessage(
        {
          action: 'RECORD_BY_IMAGE_ACTION',
          value: action
        },
        response => {
          lightbox.open({ content: 'Capture Img OK', autocCloseMs: 800 });
        }
      );
      document.getElementById('cover-spin').style.setProperty('display', 'none', 'important');
      // TODO : voir pour enlever ce settimeout 
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


