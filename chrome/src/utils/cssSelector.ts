/**
 * Identification d'un champ de saisie par sélecteur CSS.
 *
 * Les actions `input` étaient rejouées uniquement par coordonnées
 * (`document.elementFromPoint`). C'est fragile : il suffit que la mise en page ait
 * bougé depuis l'enregistrement (bandeau cookies, iframe redimensionnée après
 * chargement, publicité) pour que le point désigne un conteneur plutôt que le
 * champ — la valeur est alors posée sur un élément qui n'en a pas, sans erreur.
 * Le sélecteur reste valable tant que la structure de la page ne change pas.
 */

/** Attributs suffisamment discriminants pour désigner un champ à eux seuls */
const IDENTIFYING_ATTRIBUTES = ['name', 'data-testid', 'aria-label', 'placeholder'];

/**
 * Un identifiant régénéré à chaque affichage (`ng-1234`, `:r3:`, `mat-input-7`)
 * ne sert à rien au rejeu : il ne correspondra plus.
 */
function isGeneratedId(id: string): boolean {
  return /^[:_]/.test(id) || /\d{3,}/.test(id) || /^(ng|mat|cdk|react|ember|radix|headlessui)[-_:]/i.test(id);
}

function escapeValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function escapeIdentifier(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function isUnique(root: Document | Element, selector: string): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** Position de l'élément parmi ses frères de même balise, pour le chemin de repli */
function nthOfType(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const siblings = element.parentElement ? Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName) : [];
  if (siblings.length <= 1) {
    return tag;
  }
  return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
}

/**
 * Construit un sélecteur CSS désignant l'élément dans son document.
 * Renvoie une chaîne vide si aucun sélecteur fiable n'a pu être construit.
 */
export function buildSelector(element: Element | null): string {
  if (!element || !element.tagName || !element.ownerDocument) {
    return '';
  }
  const doc = element.ownerDocument;
  const tag = element.tagName.toLowerCase();

  if (element.id && !isGeneratedId(element.id)) {
    const selector = `#${escapeIdentifier(element.id)}`;
    if (isUnique(doc, selector)) {
      return selector;
    }
  }

  for (const attribute of IDENTIFYING_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) {
      continue;
    }
    const selector = `${tag}[${attribute}="${escapeValue(value)}"]`;
    if (isUnique(doc, selector)) {
      return selector;
    }
  }

  // Chemin structurel : on remonte jusqu'à trouver un ancêtre identifiable ou la racine.
  const path: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 10) {
    if (current.id && !isGeneratedId(current.id)) {
      path.unshift(`#${escapeIdentifier(current.id)}`);
      break;
    }
    path.unshift(nthOfType(current));
    current = current.parentElement;
  }

  const selector = path.join(' > ');
  return selector && isUnique(doc, selector) ? selector : '';
}

/** Retrouve l'élément désigné par un sélecteur construit à l'enregistrement */
export function findBySelector(selector: string): HTMLElement | null {
  if (!selector) {
    return null;
  }
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}
