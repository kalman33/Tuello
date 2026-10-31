import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { searchImg } from './imageRecorder';
import { findBySelector } from './cssSelector';
import { findClickableAncestor, findElementByLabel } from './labelSelector';
import { displayEffect, getOffset, getParentByTagName, logData } from './utils';
import { playAssertion } from './playwrightCapture';
import { findByDescriptor, matchesTarget } from './targetDescriptor';

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

function areValidCoordinates(event: string, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.warn(`Tuello: Coordonnées invalides pour l'événement ${event}: x=${x}, y=${y}`);
    return false;
  }
  return true;
}

function dispatchMouseEvent(el: Element, event: string, x: number, y: number, key: number): void {
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

function mouseEvent(event: string, x: number, y: number, key: number) {
  if (!areValidCoordinates(event, x, y)) {
    return;
  }
  const el = getElementAtAbsolutePosition(x, y);
  if (el) {
    dispatchMouseEvent(el, event, x, y, key);
  }
}

/**
 * Signale une cible retrouvée ailleurs qu'à sa position enregistrée : toujours en console
 * (le scénario vieillit, mieux vaut le savoir), et dans les logs du mode verbeux.
 */
function reportRepair(action: IUserAction, message: string): void {
  console.warn(`Tuello: ${action.type} : ${message}`);
  logData(`- Ciblage - ${action.type} : ${message}`);
}

function formatPoint(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

/** Point d'un clic, en coordonnées document, et l'élément retrouvé qu'il doit atteindre */
interface ClickTarget {
  x: number;
  y: number;
  /** Absent quand le clic part à la position enregistrée */
  element?: HTMLElement;
}

function isInViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/**
 * Point à cliquer dans l'élément retrouvé : au même endroit de l'élément qu'à
 * l'enregistrement, ou en son centre si ce point n'y tient plus (élément redimensionné)
 * ou n'a pas été enregistré (anciens scénarios).
 */
function pointInElement(element: HTMLElement, offset: IUserAction['targetOffset']): { x: number; y: number } {
  let rect = element.getBoundingClientRect();
  if (!isInViewport(rect)) {
    // 'instant' : un défilement animé (scroll-behavior: smooth) fausserait le point calculé
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
    rect = element.getBoundingClientRect();
  }
  const fits = !!offset && offset.x >= 0 && offset.y >= 0 && offset.x <= rect.width && offset.y <= rect.height;
  return {
    x: rect.left + (fits ? offset.x : rect.width / 2) + window.scrollX,
    y: rect.top + (fits ? offset.y : rect.height / 2) + window.scrollY
  };
}

/**
 * Choisit où cliquer :
 * - l'élément affiché à la position enregistrée est toujours la cible (cas courant) : on
 *   clique à cette position, exactement comme elle a été enregistrée ;
 * - sinon la cible est cherchée dans la page par sa description (data-testid, libellé,
 *   rôle et nom, texte, sélecteur) et le clic part sur elle : « cible réparée » ;
 * - introuvable, ou action enregistrée sans description : position enregistrée.
 */
function resolveClickTarget(action: IUserAction): ClickTarget {
  const recorded: ClickTarget = { x: action.x, y: action.y };
  if (!action.target) {
    return recorded;
  }
  try {
    if (matchesTarget(findClickableAncestor(getElementAtAbsolutePosition(action.x, action.y)), action.target)) {
      return recorded;
    }
    const found = findByDescriptor(action.target);
    if (!found) {
      logData(`- Ciblage - ${action.type} : cible introuvable, clic à la position enregistrée ${formatPoint(action.x, action.y)}`);
      return recorded;
    }
    const point = pointInElement(found.element, action.targetOffset);
    reportRepair(action, `cible réparée automatiquement (via ${found.strategy}) : ${formatPoint(action.x, action.y)} → ${formatPoint(point.x, point.y)}`);
    return { ...point, element: found.element };
  } catch {
    // Page en plein rendu : la position enregistrée reste le meilleur choix
    return recorded;
  }
}

/**
 * Clique au point choisi. Pour une cible retrouvée, l'événement va à l'élément affiché
 * sous ce point s'il en fait partie (un <span> dans le bouton), sinon à la cible
 * elle-même : un calque posé dessus ne doit pas avaler le clic.
 */
function clickOn(target: ClickTarget): void {
  if (!areValidCoordinates('click', target.x, target.y)) {
    return;
  }
  const atPoint = getElementAtAbsolutePosition(target.x, target.y);
  const el = target.element && !(atPoint && target.element.contains(atPoint)) ? target.element : atPoint;
  if (el) {
    dispatchMouseEvent(el, 'click', target.x, target.y, 0);
  }
}

/**
 * Attente de la cible d'une action, demandée par le player :
 * - rejeu accéléré : l'action part avant son délai enregistré, dès que la cible est
 *   affichée et immobile ;
 * - attente de sécurité (graceWait) : le délai enregistré est déjà écoulé, l'action part
 *   dès que la cible est là, au besoin un peu plus tard si la page est plus lente.
 */
interface TargetWait {
  maxWaitMs?: number;
  graceWait?: boolean;
  /**
   * Rejeu accéléré : pendant ce délai (le délai enregistré, moins le délai minimum déjà
   * écoulé), un clic n'accepte que sa cible affichée à la position enregistrée. Accepter
   * plus tôt une cible retrouvée ailleurs ferait recliquer l'écran précédent encore
   * affiché (bouton « Suivant » de l'étape d'avant). Une cible déplacée ne part ainsi
   * jamais plus tôt qu'à l'enregistrement.
   */
  relocateAfterMs?: number;
}

/**
 * Attend que la cible de l'action soit prête. Se termine toujours, au plus tard après
 * maxWaitMs : l'action est alors jouée comme si la cible était là.
 */
function waitForTarget(action: IUserAction, wait: TargetWait, isReady: (allowElsewhere: boolean) => boolean): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + wait.maxWaitMs;
  // Le délai enregistré écoulé, une cible présente n'a plus de raison d'attendre son immobilité
  const stableChecks = wait.graceWait ? 1 : TARGET_STABLE_CHECKS;
  const prefix = wait.graceWait ? '- Attente de la cible -' : '- Rejeu accéléré -';
  return new Promise((resolve) => {
    let matches = 0;
    const poll = () => {
      let ready = false;
      try {
        ready = isReady(!!wait.graceWait || Date.now() - startedAt >= (wait.relocateAfterMs ?? 0));
      } catch {
        // Une page en plein rendu ne doit pas bloquer l'action : on réessaie
      }
      matches = ready ? matches + 1 : 0;
      if (matches >= stableChecks) {
        const waited = Date.now() - startedAt;
        if (!wait.graceWait || waited > 0) {
          logData(`${prefix} ${action.type} : cible trouvée après ${waited} ms`);
        }
        resolve();
      } else if (Date.now() >= deadline) {
        logData(`${prefix} ${action.type} : cible non trouvée après ${wait.maxWaitMs} ms, action jouée quand même`);
        resolve();
      } else {
        setTimeout(poll, TARGET_POLL_MS);
      }
    };
    poll();
  });
}

/** Sans attente demandée, appel direct */
function playWhenReady(action: IUserAction, wait: TargetWait, isReady: (allowElsewhere: boolean) => boolean, play: () => void): void {
  if (wait.maxWaitMs > 0) {
    waitForTarget(action, wait, isReady).then(play);
  } else {
    play();
  }
}

/**
 * Clic : l'élément affiché aux coordonnées enregistrées est celui qui avait été cliqué,
 * ou bien, si allowElsewhere, il est affiché ailleurs dans la page (il sera alors
 * cliqué là où il est).
 */
function isClickTargetReady(action: IUserAction, allowElsewhere: boolean): boolean {
  // Même remontée vers l'élément cliquable qu'à l'enregistrement (UserAction)
  const element = findClickableAncestor(getElementAtAbsolutePosition(action.x, action.y));
  // La vérification au point, peu coûteuse, passe avant la recherche dans la page
  return matchesTarget(element, action.target) || (allowElsewhere && !!findByDescriptor(action.target));
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
 * Le sélecteur, puis la description du champ (libellé, placeholder...), passent avant
 * les coordonnées : celles-ci désignent le coin haut-gauche du champ au moment de
 * l'enregistrement, et le moindre décalage de mise en page (bandeau, iframe
 * redimensionnée, contenu chargé plus tard) fait pointer `elementFromPoint` sur un
 * conteneur — la valeur partait alors dans le vide.
 *
 * @param report signale le critère de repli utilisé (appel au moment de jouer l'action,
 * et non à chaque vérification de l'attente)
 */
function findInputTarget(action: IUserAction, report = false): HTMLElement | null {
  const bySelector = findBySelector(action.selector);
  if (isFillable(bySelector)) {
    return bySelector;
  }

  const found = findByDescriptor(action.target);
  if (found && isFillable(found.element)) {
    if (report) {
      reportRepair(action, `cible réparée automatiquement (via ${found.strategy})${action.selector ? `, sélecteur « ${action.selector} » introuvable` : ''}`);
    }
    return found.element;
  }

  const atPoint = getElementAtAbsolutePosition(action.x, action.y);
  let byPoint: HTMLElement | null = null;
  if (isFillable(atPoint)) {
    byPoint = atPoint;
  } else {
    // Le point peut tomber sur l'habillage du champ (bordure, conteneur) : on
    // accepte le champ qu'il contient s'il n'y en a qu'un.
    const nested = atPoint?.querySelectorAll<HTMLElement>('input, textarea, select');
    if (nested && nested.length === 1) {
      byPoint = nested[0];
    }
  }
  if (byPoint && report && (action.selector || action.target)) {
    logData(`- Ciblage - ${action.type} : champ introuvable par sélecteur et description, saisie à la position enregistrée ${formatPoint(action.x, action.y)}`);
  }
  return byPoint;
}

/**
 * Champ sur lequel Entrée a été pressée : sélecteur, puis description, sans repli sur
 * les coordonnées (qui désignent toujours un élément, même le mauvais).
 */
function findEnterKeyTarget(action: IUserAction, report = false): Element | null {
  const bySelector = findBySelector(action.selector);
  if (bySelector) {
    return bySelector;
  }
  const found = findByDescriptor(action.target);
  if (found && report) {
    reportRepair(action, `cible réparée automatiquement (via ${found.strategy})${action.selector ? `, sélecteur « ${action.selector} » introuvable` : ''}`);
  }
  return found?.element ?? null;
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
  const el = findInputTarget(action, true);
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

function enterKeypress(action: IUserAction) {
  const el = findEnterKeyTarget(action, true) ?? getElementAtAbsolutePosition(action.x, action.y);
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
 * @param maxWaitMs clic, saisie, Entrée, scroll, Maj+clic, image : attente maximale de la cible
 * @param graceWait l'attente suit le délai enregistré (voir TargetWait)
 * @param relocateAfterMs rejeu accéléré : délai avant d'accepter une cible déplacée (voir TargetWait)
 */
export function run(action: IUserAction, maxWaitMs?: number, graceWait = false, relocateAfterMs?: number) {
  const wait: TargetWait = { maxWaitMs, graceWait, relocateAfterMs };
  return new Promise((resolve, reject) => {
    switch (action.type) {
      case 'click':
        const playClick = () => {
          // Résolue au moment de jouer, après l'attente : la page a fini de bouger
          const target = resolveClickTarget(action);
          displayEffect(target.x, target.y);
          // Laisse le navigateur peindre le repère avant de déclencher le clic : sans ce délai,
          // tout se joue dans la même tâche JS (avant le prochain repaint), et le repère n'est
          // jamais visible avant que le clic n'ait déjà changé l'écran.
          setTimeout(() => {
            clickOn(target);
            resolve(true);
          }, 100);
        };
        playWhenReady(action, wait, (allowElsewhere) => isClickTargetReady(action, allowElsewhere), playClick);
        break;
      case 'mouseup':
        mouseup(action.x, action.y, action.key);
        resolve(true);
        break;
      case 'input':
        playWhenReady(
          action,
          wait,
          () => isDisplayed(findInputTarget(action)),
          () => resolve(input(action))
        );
        break;
      case 'enterKey':
        playWhenReady(
          action,
          wait,
          () => isDisplayed(findEnterKeyTarget(action)),
          () => {
            enterKeypress(action);
            resolve(true);
          }
        );
        break;
      case 'scroll':
        playWhenReady(
          action,
          wait,
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
          wait,
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
