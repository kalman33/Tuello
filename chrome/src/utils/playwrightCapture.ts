/**
 * Captures réalisées dans la page pour l'export Playwright :
 * - la photo du stockage au démarrage de l'enregistrement ;
 * - les vérifications posées au clic droit (« Vérifier ce texte », « Vérifier que l'élément
 *   est visible ») et leur contrôle pendant le rejeu Tuello.
 */
import { InitialState } from '../../../src/app/spy-http/models/InitialState';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { buildSelector, findBySelector } from './cssSelector';
import { findClickableAncestor, findElementByLabel, normalizeLabel } from './labelSelector';
import { describeTarget } from './targetDescriptor';

export type AssertionKind = 'text' | 'visible';

/** Au-delà, le texte d'un élément est un paragraphe entier : on le tronque à sa première partie */
const MAX_ASSERTED_TEXT = 200;

/** Durée pendant laquelle le rejeu attend qu'une vérification devienne vraie */
const ASSERTION_TIMEOUT_MS = 5000;
const ASSERTION_POLL_MS = 200;

const FIELD_TAGS = ['input', 'select', 'textarea'];

/** Dernier élément sous le clic droit : le menu contextuel de Chrome ne le fournit pas */
let lastContextTarget: WeakRef<Element> | null = null;

/** Mémorise l'élément visé par chaque clic droit (en capture : avant que la page ne l'intercepte) */
export function trackContextMenuTarget(): void {
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastContextTarget = event.target instanceof Element ? new WeakRef(event.target) : null;
    },
    true
  );
}

function readStorage(storage: Storage): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) {
        values[key] = storage.getItem(key) ?? '';
      }
    }
  } catch {
    // Stockage inaccessible (navigation privée, politique de sécurité) : photo partielle
  }
  return values;
}

function readCookies(): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (document.cookie || '').split(';')) {
    const index = part.indexOf('=');
    const name = (index === -1 ? part : part.slice(0, index)).trim();
    if (name) {
      cookies[name] = index === -1 ? '' : part.slice(index + 1).trim();
    }
  }
  return cookies;
}

/** Stockage de la page, hors données internes de Tuello */
export function captureInitialState(): InitialState {
  const withoutTuello = (values: Record<string, string>) => {
    const kept: Record<string, string> = {};
    for (const key of Object.keys(values)) {
      if (!key.toUpperCase().startsWith('TUELLO')) {
        kept[key] = values[key];
      }
    }
    return kept;
  };
  return {
    origin: window.location.origin,
    localStorage: withoutTuello(readStorage(window.localStorage)),
    sessionStorage: withoutTuello(readStorage(window.sessionStorage)),
    cookies: readCookies(),
    capturedAt: Date.now()
  };
}

function isField(element: Element): boolean {
  return FIELD_TAGS.includes(element.tagName.toLowerCase());
}

/**
 * Construit la vérification demandée sur le dernier élément cliqué droit.
 * Pour « Vérifier ce texte », un texte sélectionné prime sur le texte de l'élément.
 */
export function captureAssertion(kind: AssertionKind): IUserAction | null {
  const element = lastContextTarget?.deref();
  if (!element || !element.isConnected) {
    return null;
  }

  const action: IUserAction = {
    type: kind === 'text' ? 'assertText' : 'assertVisible',
    frame: undefined,
    hrefLocation: window.location.href,
    eventTimestamp: Date.now()
  };

  if (kind === 'visible') {
    const target = findClickableAncestor(element) ?? element;
    action.target = describeTarget(target);
    action.selector = buildSelector(target) || undefined;
    return action;
  }

  action.target = describeTarget(element);
  action.selector = buildSelector(element) || undefined;
  if (isField(element)) {
    action.value = (element as HTMLInputElement).value ?? '';
    return action;
  }
  const selection = normalizeLabel(window.getSelection()?.toString());
  const text = selection || normalizeLabel((element as HTMLElement).innerText ?? element.textContent);
  if (!text) {
    return null;
  }
  action.value = text.slice(0, MAX_ASSERTED_TEXT);
  return action;
}

function isVisible(element: Element | null): boolean {
  return !!element && element.getClientRects().length > 0;
}

function checkAssertion(action: IUserAction): boolean {
  if (action.type === 'assertVisible') {
    const element = findBySelector(action.selector) ?? findElementByLabel(action.target?.text || action.target?.name || '');
    return isVisible(element);
  }
  if (action.target && FIELD_TAGS.includes(action.target.tag)) {
    const field = findBySelector(action.selector) as HTMLInputElement | null;
    return !!field && field.value === (action.value ?? '');
  }
  const expected = normalizeLabel(action.value);
  return !!expected && normalizeLabel(document.body?.innerText).includes(expected);
}

/**
 * Contrôle une vérification pendant le rejeu Tuello, en laissant à la page le temps
 * d'afficher le résultat attendu (réponse HTTP, animation).
 */
export function playAssertion(action: IUserAction): Promise<boolean> {
  const deadline = Date.now() + ASSERTION_TIMEOUT_MS;
  return new Promise((resolve) => {
    const poll = () => {
      if (checkAssertion(action)) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, ASSERTION_POLL_MS);
      }
    };
    poll();
  });
}
