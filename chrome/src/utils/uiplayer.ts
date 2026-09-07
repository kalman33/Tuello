import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { searchImg } from './imageRecorder';
import { findBySelector } from './cssSelector';
import { findClickableAncestor, findElementByLabel } from './labelSelector';
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
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.warn(`Tuello: Coordonnées invalides pour l'événement ${event}: x=${x}, y=${y}`);
    return;
  }
  const el = getElementAtAbsolutePosition(x, y);
  if (!el) {
    return;
  }
  // clientX/clientY sont des coordonnées viewport : passer les coordonnées absolues
  // donnait une position fausse à tout code applicatif lisant l'événement (menus,
  // tooltips, drag) dès que la page était scrollée.
  const viewport = toViewportCoordinates(x, y);
  const ev = new MouseEvent(event, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: viewport.x,
    clientY: viewport.y,
    screenX: x,
    screenY: y,
    button: key
  });
  el.dispatchEvent(ev);
}

function mouseup(x: number, y: number, key: number) {
  mouseEvent('mouseup', x, y, key);
}

function scrollTo(scrollX: number, scrollY: number): void {
  window.scrollTo(scrollX, scrollY);
}

/** Éléments capables de recevoir une saisie */
function isFillable(el: Element | null): el is HTMLElement {
  if (!el) {
    return false;
  }
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
}

/**
 * Retrouve le champ à remplir.
 *
 * Le sélecteur passe avant les coordonnées : celles-ci désignent le coin haut-gauche
 * du champ au moment de l'enregistrement, et le moindre décalage de mise en page
 * (bandeau, iframe redimensionnée, contenu chargé plus tard) fait pointer
 * `elementFromPoint` sur un conteneur — la valeur partait alors dans le vide.
 */
function findInputTarget(action: IUserAction): HTMLElement | null {
  const bySelector = findBySelector(action.selector);
  if (isFillable(bySelector)) {
    return bySelector;
  }

  const atPoint = getElementAtAbsolutePosition(action.x, action.y);
  if (isFillable(atPoint)) {
    return atPoint as HTMLElement;
  }
  // Le point peut tomber sur l'habillage du champ (bordure, conteneur) : on
  // accepte le champ qu'il contient s'il n'y en a qu'un.
  const nested = atPoint?.querySelectorAll<HTMLElement>('input, textarea, select');
  if (nested && nested.length === 1) {
    return nested[0];
  }
  return null;
}

/**
 * Affecte la valeur via le setter natif : React (et tout framework qui surveille
 * la propriété) ignore une écriture directe sur `element.value` et réaffiche
 * l'ancienne valeur au rendu suivant.
 */
function setNativeValue(el: HTMLElement, value: string): void {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }
}

function input(action: IUserAction): boolean {
  const el = findInputTarget(action);
  if (!el) {
    console.warn('Tuello: champ de saisie introuvable', { selector: action.selector, x: action.x, y: action.y });
    return false;
  }

  // Certaines pages n'écoutent la saisie qu'une fois le champ focalisé.
  (el as HTMLElement).focus?.();

  if (el.isContentEditable) {
    el.textContent = action.value;
  } else {
    setNativeValue(el, action.value);
  }

  // Déclencher les événements pour que les frameworks réactifs détectent le changement
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function enterKeypress(x: number, y: number, selector?: string) {
  const el = findBySelector(selector) ?? getElementAtAbsolutePosition(x, y);
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
        displayEffect(x, y);
        mouseEvent('click', x, y, 0);
        resolve(true);
        break;
      case 'mouseup':
        mouseup(action.x, action.y, action.key);
        resolve(true);
        break;
      case 'input':
        resolve(input(action));
        break;
      case 'enterKey':
        enterKeypress(action.x, action.y, action.selector);
        resolve(true);
        break;
      case 'scroll':
        scrollTo(action.scrollX, action.scrollY);
        resolve(true);
        break;
      case 'recordByLabel':
        // Recherche par texte : l'élément a pu changer de position depuis
        // l'enregistrement, ses coordonnées ne sont pas exploitables.
        const labelElement = findElementByLabel(action.label, action.labelTag);
        if (!labelElement) {
          chrome.runtime.sendMessage(
            {
              action: 'PLAY_ACTION_ERROR'
            },
            () => resolve(false)
          );
          break;
        }
        const clickable = findClickableAncestor(labelElement) ?? labelElement;
        const clickableOffset = getOffset(clickable);
        displayEffect(clickableOffset.left + clickable.offsetWidth / 2, clickableOffset.top + clickable.offsetHeight / 2);
        clickable.click();
        resolve(true);
        break;
      case 'recordByImg':
        searchImg(action)
          .then((img) => {
            if (img instanceof HTMLElement) {
              const offset = getOffset(img);
              displayEffect(img.offsetWidth / 2 + offset.left, img.offsetHeight / 2 + offset.top);
              img.click();
              resolve(true);
            } else {
              resolve(false);
            }
          })
          .catch((err) => {
            chrome.runtime.sendMessage(
              {
                action: 'PLAY_ACTION_ERROR'
              },
              () => reject(false)
            );
          });
        break;
      default:
        resolve(true);
        break;
    }
  });
}
