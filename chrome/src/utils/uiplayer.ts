import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { searchImg } from './imageRecorder';
import { findBySelector } from './cssSelector';
import { findClickableAncestor, findElementByLabel } from './labelSelector';
import { displayEffect, getOffset, getParentByTagName, logData } from './utils';
import { playAssertion } from './playwrightCapture';
import { matchesTarget } from './targetDescriptor';

/** Rejeu accéléré : intervalle de vérification de la cible d'une action */
const TARGET_POLL_MS = 100;
/** Correspondances consécutives exigées : une cible encore en mouvement (animation) ne compte pas */
const TARGET_STABLE_CHECKS = 2;

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

/**
 * Rejeu accéléré : attend que la cible de l'action soit prête. Se termine toujours, au
 * plus tard après maxWaitMs : l'action est alors jouée comme sans l'option.
 */
function waitForTarget(action: IUserAction, maxWaitMs: number, isReady: () => boolean): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  return new Promise((resolve) => {
    let matches = 0;
    const poll = () => {
      let ready = false;
      try {
        ready = isReady();
      } catch {
        // Une page en plein rendu ne doit pas bloquer l'action : on réessaie
      }
      matches = ready ? matches + 1 : 0;
      if (matches >= TARGET_STABLE_CHECKS) {
        logData(`- Rejeu accéléré - ${action.type} : cible trouvée après ${Date.now() - startedAt} ms`);
        resolve();
      } else if (Date.now() >= deadline) {
        logData(`- Rejeu accéléré - ${action.type} : cible non trouvée après ${maxWaitMs} ms, action jouée comme sans l'option`);
        resolve();
      } else {
        setTimeout(poll, TARGET_POLL_MS);
      }
    };
    poll();
  });
}

/** Sans rejeu accéléré, appel direct : même déroulé qu'avant l'option */
function playWhenReady(action: IUserAction, maxWaitMs: number | undefined, isReady: () => boolean, play: () => void): void {
  if (maxWaitMs > 0) {
    waitForTarget(action, maxWaitMs, isReady).then(play);
  } else {
    play();
  }
}

/**
 * Clic : l'élément affiché aux coordonnées enregistrées est celui qui avait été cliqué.
 * Le point du clic, lui, ne change jamais.
 */
function isClickTargetReady(action: IUserAction): boolean {
  // Même remontée vers l'élément cliquable qu'à l'enregistrement (UserAction)
  const element = findClickableAncestor(getElementAtAbsolutePosition(action.x, action.y));
  return matchesTarget(element, action.target);
}

/**
 * Scroll : la page est assez grande pour atteindre la position enregistrée. Sinon, le
 * contenu n'est pas encore chargé (liste, lazy-loading) et le scroll s'arrêterait avant.
 */
function canScrollTo(scrollX: number, scrollY: number): boolean {
  const root = document.scrollingElement ?? document.documentElement;
  // 1px de tolérance : les positions enregistrées peuvent être fractionnaires
  return root.scrollWidth - root.clientWidth >= (scrollX ?? 0) - 1 && root.scrollHeight - root.clientHeight >= (scrollY ?? 0) - 1;
}

function isDisplayed(element: Element | null): boolean {
  return !!element && element.getClientRects().length > 0;
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

/**
 * @param maxWaitMs rejeu accéléré uniquement (clic, saisie, Entrée, Maj+clic, image) :
 * attente maximale de la cible
 */
export function run(action: IUserAction, maxWaitMs?: number) {
  return new Promise((resolve, reject) => {
    switch (action.type) {
      case 'click':
        const x = action.x;
        const y = action.y;
        const playClick = () => {
          displayEffect(x, y);
          // Laisse le navigateur peindre le repère avant de déclencher le clic : sans ce délai,
          // tout se joue dans la même tâche JS (avant le prochain repaint), et le repère n'est
          // jamais visible avant que le clic n'ait déjà changé l'écran.
          setTimeout(() => {
            mouseEvent('click', x, y, 0);
            resolve(true);
          }, 100);
        };
        playWhenReady(action, maxWaitMs, () => isClickTargetReady(action), playClick);
        break;
      case 'mouseup':
        mouseup(action.x, action.y, action.key);
        resolve(true);
        break;
      case 'input':
        playWhenReady(
          action,
          maxWaitMs,
          () => isDisplayed(findInputTarget(action)),
          () => resolve(input(action))
        );
        break;
      case 'enterKey':
        playWhenReady(
          action,
          maxWaitMs,
          () => isDisplayed(findBySelector(action.selector)),
          () => {
            enterKeypress(action.x, action.y, action.selector);
            resolve(true);
          }
        );
        break;
      case 'scroll':
        playWhenReady(
          action,
          maxWaitMs,
          () => canScrollTo(action.scrollX, action.scrollY),
          () => {
            scrollTo(action.scrollX, action.scrollY);
            resolve(true);
          }
        );
        break;
      case 'recordByLabel':
        // findElementByLabel ne retient que les éléments visibles
        playWhenReady(
          action,
          maxWaitMs,
          () => !!findElementByLabel(action.label, action.labelTag),
          () => {
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
              return;
            }
            const clickable = findClickableAncestor(labelElement) ?? labelElement;
            const clickableOffset = getOffset(clickable);
            displayEffect(clickableOffset.left + clickable.offsetWidth / 2, clickableOffset.top + clickable.offsetHeight / 2);
            setTimeout(() => {
              clickable.click();
              resolve(true);
            }, 100);
          }
        );
        break;
      case 'assertText':
      case 'assertVisible':
        playAssertion(action).then((ok) => {
          if (ok) {
            resolve(true);
            return;
          }
          // Même traitement qu'un élément introuvable : le rejeu se met en pause sur l'action
          chrome.runtime.sendMessage({ action: 'PLAY_ACTION_ERROR' }, () => resolve(false));
        });
        break;
      case 'recordByImg':
        // La recherche d'image est trop coûteuse pour un poll toutes les 100 ms : c'est
        // searchImg qui prolonge ses propres tentatives jusqu'à maxWaitMs.
        searchImg(action, maxWaitMs)
          .then((img) => {
            if (img instanceof HTMLElement) {
              const offset = getOffset(img);
              displayEffect(img.offsetWidth / 2 + offset.left, img.offsetHeight / 2 + offset.top);
              setTimeout(() => {
                img.click();
                resolve(true);
              }, 100);
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
