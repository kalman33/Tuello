/**
 * Listener des post message provenant de contentscript
 */
import { ImageType } from '../../src/app/spy-http/models/UserAction';
import { UserAction } from './models/UserAction';
import { convertElementToBase64, findImageHover } from './utils/imageRecorder';
import { buildSelector } from './utils/cssSelector';
import { extractLabel, findClickableAncestor } from './utils/labelSelector';
import * as lightbox from './utils/lightbox';
import { showToast } from './utils/toast';
import { recordHttpUserActionListener } from './utils/recordUserActionListener';
import { recordConsoleLogListener } from './utils/recordConsoleLogListener';
import { recordHttpSettledListener } from './utils/recordHttpSettledListener';
import { addcss } from './utils/utils';
import { addFrameOffsetListener, removeFrameOffsetListener, resolveTopPageCoordinates } from './utils/frameOffset';

interface KeyboardShortcut {
  key: string;
  code: string;
}

let frame;
let screenshotKeyboardShortcut: KeyboardShortcut;
let captureImageKeyboardShortcut: KeyboardShortcut;
let commentKeyboardShortcut: KeyboardShortcut;

/**
 * Normalise un raccourci stocké : on accepte l'objet { key, code } comme la simple
 * lettre (anciens enregistrements), sinon on retombe sur la valeur par défaut.
 */
function toShortcut(stored: any, fallback: KeyboardShortcut): KeyboardShortcut {
  if (stored && typeof stored === 'object' && stored.key) {
    return { key: stored.key, code: stored.code ?? `Key${String(stored.key).toUpperCase()}` };
  }
  if (typeof stored === 'string' && stored.length > 0) {
    return { key: stored, code: `Key${stored.toUpperCase()}` };
  }
  return fallback;
}

export function launchUIRecorderHandler() {
  chrome.storage.local.get(['uiRecordActivated', 'tuelloKeyboardShortcut'], (results: Record<string, any>) => {
    if (results.uiRecordActivated) {
      const shortcuts = results.tuelloKeyboardShortcut;
      screenshotKeyboardShortcut = toShortcut(shortcuts?.screenshot, { key: 'S', code: 'KeyS' });
      captureImageKeyboardShortcut = toShortcut(shortcuts?.captureImage, { key: 'I', code: 'KeyI' });
      commentKeyboardShortcut = toShortcut(shortcuts?.comment, { key: 'C', code: 'KeyC' });
      // on previent background qu'on a démarré le recording
      chrome.runtime.sendMessage(
        {
          action: 'LOAD_UI_RECORDERS',
          value: true
        },
        () => {}
      );

      // On active le recorder http
      httpRecordUI(true);

      // si on est en devtools, on valorise l'index de l'iframe ou -1 si on est en top
      if (window['TuelloFrameIndex'] !== undefined) {
        frame = {
          frameIndex: window['TuelloFrameIndex']
        };
      }

      if (window.self === window.top) {
        chrome.runtime.sendMessage(
          {
            action: 'RECORD_WINDOW_SIZE'
          },
          () => {}
        );
      }
      // on crée un event de scroll si l'utilisateur n'est pas en haut de la page
      if ((window as any).scrollX !== 0 || (window as any).scrollY !== 0) {
        chrome.runtime.sendMessage(
          {
            action: 'RECORD_USER_ACTION',
            value: {
              scrollX: (window as any).scrollX,
              scrollY: (window as any).scrollY,
              type: 'scroll',
              frame
            }
          },
          () => {}
        );
      }
      addListeners();
    } else {
      removeListeners();
      //httpRecordUI(false);
    }
  });
}

// permet d'activer le recording d'ui pour la partie http (et les logs console, même cycle de vie)
function httpRecordUI(activation: boolean) {
  window.postMessage(
    {
      type: 'RECORD_HTTP_ACTIVATED',
      value: activation,
      // Distingue cette activation de celle, indépendante, de la fonctionnalité Recorder HTTP
      // (/recorder) : les deux partagent le même hook d'interception côté httpmanager.ts, qui
      // combine les deux sources plutôt que de laisser la dernière écraser l'autre.
      source: 'spy'
    },
    window.location.origin
  );
  window.postMessage(
    {
      type: 'RECORD_CONSOLE_LOG_ACTIVATED',
      value: activation
    },
    window.location.origin
  );
  window.postMessage(
    {
      type: 'AUTO_SCREENSHOT_ON_HTTP_ACTIVATED',
      value: activation
    },
    window.location.origin
  );
  if (activation) {
    window.addEventListener('message', recordHttpUserActionListener);
    window.addEventListener('message', recordConsoleLogListener);
    window.addEventListener('message', recordHttpSettledListener);
  } else {
    window.removeEventListener('message', recordHttpUserActionListener);
    window.removeEventListener('message', recordConsoleLogListener);
    window.removeEventListener('message', recordHttpSettledListener);
  }
}

function removeListeners() {
  document.removeEventListener('keydown', keyboardListener);
  document.removeEventListener('click', labelListener, true);
  document.removeEventListener('click', listener, true);
  document.removeEventListener('scroll', listener);
  document.removeEventListener('input', listener);
  // document.removeEventListener('change', listener); // select
  document.removeEventListener('mousedown', mousedownListener);
  window.removeEventListener('resize', resizeListener);
  removeFrameOffsetListener();
}

function addListeners() {
  // remove listeners pour etre sur qu'il y en ai pas deux
  removeListeners();

  // Un ancêtre (frame intermédiaire ou top) doit pouvoir répondre à une demande de
  // conversion de coordonnées même s'il n'est pas lui-même la cible du clic (voir
  // mousedownListener / frameOffset.ts).
  addFrameOffsetListener();

  document.addEventListener('keydown', keyboardListener);
  // En capture : Maj+clic doit être intercepté avant que la page (et le listener
  // de clic ci-dessous) ne le traite, cf. labelListener.
  document.addEventListener('click', labelListener, true);
  // En capture également : fait enregistrer l'action avant que la page ne traite le clic
  // (changement de DOM, navigation...). La capture "avant" elle-même démarre dès le mousedown
  // (voir mousedownListener), pas ici : le round-trip HIDE/capture est asynchrone, donc même en
  // capture ce listener s'exécuterait toujours trop tard pour déclencher la capture lui-même.
  document.addEventListener('click', listener, true);
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
    chrome.runtime.sendMessage(
      {
        action: 'RECORD_USER_ACTION',
        value: useraction
      },
      () => {}
    );
  }
}

/** Champs où Maj+clic sert à sélectionner du texte */
function isEditable(element: HTMLElement): boolean {
  if (!element) {
    return false;
  }
  const tag = element.tagName?.toLowerCase();
  if (tag === 'textarea' || element.isContentEditable) {
    return true;
  }
  if (tag !== 'input') {
    return false;
  }
  const type = (element as HTMLInputElement).type?.toLowerCase();
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file'].includes(type);
}

/**
 * Maj+clic : enregistre l'élément par son libellé plutôt que par ses coordonnées.
 *
 * Intercepté en capture pour couper net le clic d'origine : la page ne doit pas le
 * traiter tout de suite (Maj+clic ouvre un lien dans une nouvelle fenêtre, et
 * certaines applications ont leur propre comportement pour cette combinaison).
 * Une fois l'action enregistrée, on rejoue un clic simple pour que le parcours de
 * l'utilisateur se poursuive normalement — ce clic programmatique n'a pas de
 * coordonnées, `listener` ne l'enregistre donc pas en double.
 */
function labelListener(e: MouseEvent) {
  if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
    return;
  }

  const target = e.target as HTMLElement;
  // Dans un champ de saisie, Maj+clic étend la sélection de texte : l'intercepter
  // priverait l'utilisateur de ce geste sans rien apporter (on saisit un champ, on
  // ne le désigne pas par son libellé).
  if (isEditable(target)) {
    return;
  }

  const clickable = findClickableAncestor(target);
  // Le texte de la cible exacte est plus discriminant que celui de son conteneur :
  // le <span> du chiffre, pas l'ensemble du contenu du bouton.
  const label = extractLabel(target) || extractLabel(clickable);

  if (!label) {
    showToast('Tuello : aucun libellé sur cet élément');
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const action = new UserAction(null);
  action.type = 'recordByLabel';
  action.label = label;
  action.labelTag = target?.tagName ? target.tagName.toLowerCase() : undefined;
  action.hrefLocation = window.location.href;
  action.frame = frame;

  chrome.runtime.sendMessage(
    {
      action: 'RECORD_BY_LABEL_ACTION',
      value: action
    },
    () => {
      showToast(`Tuello : libellé « ${label} » enregistré`);
      (clickable ?? target)?.click();
    }
  );
}

function keyboardListener(e) {
  if (e.altKey && e.shiftKey && (e.key === screenshotKeyboardShortcut.key || e.code === screenshotKeyboardShortcut.code)) {
    const isPopupVisible = document.getElementById('iframeTuello') && document.getElementById('iframeTuello').style.display !== 'none' ? true : false;
    chrome.runtime.sendMessage(
      {
        action: 'SCREENSHOT_ACTION',
        value: isPopupVisible
      },
      (response) => {
        lightbox.open({ content: 'Capture OK', autocCloseMs: 800 });
      }
    );

    return false;
  } else if (e.altKey && e.shiftKey && (e.key === commentKeyboardShortcut.key || e.code === commentKeyboardShortcut.code)) {
    chrome.runtime.sendMessage(
      {
        action: 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION',
        value: true
      },
      () => {}
    );
    chrome.storage.local.get(['messages'], (results: Record<string, any>) => {
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

      lightbox.open({ content: formElt }).then((comment) => {
        chrome.runtime.sendMessage(
          {
            action: 'COMMENT_ACTION',
            value: comment
          },
          () => {
            chrome.runtime.sendMessage(
              {
                action: 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION',
                value: false
              },
              () => {}
            );
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
    action.selector = buildSelector(e.target as Element);
    action.frame = frame;
    chrome.runtime.sendMessage(
      {
        action: 'RECORD_USER_ACTION',
        value: action
      },
      () => {}
    );
  }
}

function mousedownListener(e) {
  // Maj+clic est enregistré par libellé (labelListener) : sans ce garde, un submit
  // était en plus enregistré par coordonnées.
  if (e.shiftKey && !e.altKey) {
    return;
  }

  // Démarre la capture "avant" dès maintenant, avant que le click qui suit ne laisse la page
  // réagir : attendre l'événement 'click' pour la déclencher était trop tard (round-trip HIDE/
  // captureVisibleTab/SHOW asynchrone, cf. prepareClickScreenshot côté background).
  //
  // e.pageX/e.pageY sont relatifs au document de CE frame : dans une iframe, ça ignore son
  // propre décalage dans la page hôte (header, menu...). La capture, elle, est un
  // screenshot plein-onglet (chrome.tabs.captureVisibleTab) dont la géométrie est celle du
  // frame top-level : on convertit donc avant d'envoyer, sans quoi le repère dessiné plus
  // tard sur l'image (voir drawScreenshotWithMarker) apparaît décalé en haut à gauche du
  // clic réel.
  resolveTopPageCoordinates(e.pageX, e.pageY).then(({ x, y }) => {
    chrome.runtime.sendMessage(
      {
        action: 'PREPARE_CLICK_SCREENSHOT',
        value: { x, y }
      },
      () => {}
    );
  });

  // on surveille qu'il ne s'agise pas d'un click sur un bouton submit car l'event click n'est pas remonté dans ce cas
  if (e.target.tagName && e.target.tagName.toLowerCase() === 'input' && e.target.type && e.target.type.toLowerCase() === 'submit') {
    const useraction = new UserAction(null);
    useraction.type = 'click';
    useraction.x = e.pageX;
    useraction.y = e.pageY;
    useraction.hrefLocation = window.location.href;
    useraction.frame = frame;
    chrome.runtime.sendMessage(
      {
        action: 'RECORD_USER_ACTION',
        value: useraction
      },
      () => {}
    );
  }
}

function resizeListener() {
  const useraction = new UserAction(null);
  useraction.type = 'resize';
  useraction.hrefLocation = window.location.href;
  useraction.frame = frame;
  chrome.runtime.sendMessage(
    {
      action: 'RECORD_USER_ACTION',
      value: useraction
    },
    () => {}
  );
}

function recordImage(withClick: boolean) {
  // if (elt && elt.length > 0 && elt[elt.length - 1].nodeName.toLowerCase() === 'img') {
  const elt = findImageHover();
  if (elt) {
    // const elt = document.querySelectorAll( ":hover" );
    document.getElementById('cover-spin')?.style?.setProperty('display', 'block', 'important');

    // Record by img
    // L'élément est par définition survolé (findImageHover) : on force la capture d'un
    // rendu au repos, sinon la référence porte les couleurs du :hover et ne correspond
    // à rien au rejeu.
    convertElementToBase64(elt as HTMLElement, true)
      .then((base64Img) => {
        const action = new UserAction(null);
        action.type = 'recordByImg';
        action.value = base64Img;
        action.frame = frame;
        ((action.clientHeight = elt.clientHeight), (action.clientWidth = elt.clientWidth));
        action.imageType = elt instanceof HTMLImageElement ? ImageType.IMG : ImageType.BACKGROUND;
        chrome.runtime.sendMessage(
          {
            action: 'RECORD_BY_IMAGE_ACTION',
            value: action
          },
          (response) => {
            lightbox.open({ content: 'Capture Img OK', autocCloseMs: 800 });
          }
        );
        document.getElementById('cover-spin')?.style?.setProperty('display', 'none', 'important');
        // TODO : voir pour enlever ce settimeout
        if (withClick) {
          setTimeout(() => {
            elt.click();
          }, 200);
        }
      })
      .catch((error) => {
        document.getElementById('cover-spin')?.style?.setProperty('display', 'none', 'important');
        // Sans retour visuel, l'utilisateur croit avoir enregistré l'image alors qu'aucune action n'a été créée
        console.warn('Tuello: capture image impossible', error);
        lightbox.open({ content: 'Capture Img KO : ' + (error?.message || 'image non exploitable'), autocCloseMs: 2500 });
      });
  }
}
