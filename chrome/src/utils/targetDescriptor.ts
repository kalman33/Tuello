/**
 * Description d'un élément telle que Playwright la comprend (rôle, nom accessible,
 * libellé, texte), calculée à l'enregistrement pour l'export Playwright.
 *
 * C'est une approximation volontairement simple des règles d'accessibilité (ARIA et
 * calcul du nom accessible) : elle couvre les cas courants d'une application de gestion
 * (boutons, liens, champs, onglets). Une désignation qui ne correspondrait pas au rejeu
 * Playwright échoue de façon explicite (« locator resolved to 0 elements »), jamais en
 * silence : le développeur corrige la ligne concernée.
 */
import { ITargetDescriptor } from '../models/TargetDescriptor';
import { buildSelector } from './cssSelector';
import { findAllByText, normalizeLabel } from './labelSelector';

/** Au-delà, un nom ou un texte ne sert plus à désigner un élément mais à le décrire */
const MAX_NAME_LENGTH = 80;

/** Au-delà, compter les homonymes coûterait trop cher au moment du clic */
const MAX_ROLE_CANDIDATES = 400;

/** Profondeur maximale explorée pour lire le texte d'un élément */
const MAX_TEXT_DEPTH = 8;

/** Éléments candidats à chaque rôle, rôle explicite compris */
const ROLE_SELECTORS: Record<string, string> = {
  button: 'button,input[type="button" i],input[type="submit" i],input[type="reset" i],input[type="image" i],[role~="button"]',
  link: 'a[href],area[href],[role~="link"]',
  checkbox: 'input[type="checkbox" i],[role~="checkbox"]',
  radio: 'input[type="radio" i],[role~="radio"]',
  combobox: 'select,input[list],[role~="combobox"]',
  listbox: 'select,[role~="listbox"]',
  option: 'option,[role~="option"]',
  heading: 'h1,h2,h3,h4,h5,h6,[role~="heading"]',
  textbox: 'input,textarea,[role~="textbox"]',
  searchbox: 'input[type="search" i],[role~="searchbox"]',
  spinbutton: 'input[type="number" i],[role~="spinbutton"]',
  slider: 'input[type="range" i],[role~="slider"]',
  img: 'img,[role~="img"]'
};

/** Rôles dont le nom accessible vient du contenu de l'élément */
const NAME_FROM_CONTENT = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'heading', 'switch', 'treeitem', 'cell', 'columnheader', 'rowheader', 'gridcell', 'row'];

/** Champs de saisie : désignés par leur libellé plutôt que par leur rôle */
const FIELD_TAGS = ['input', 'select', 'textarea'];

const TEXTBOX_INPUT_TYPES = ['', 'text', 'email', 'tel', 'url'];

function isHidden(element: Element): boolean {
  if (element.getAttribute('aria-hidden') === 'true' || (element as HTMLElement).hidden) {
    return true;
  }
  const style = window.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== 'hidden';
}

/** Rôle ARIA explicite, sinon implicite d'après la balise */
export function computeRole(element: Element): string | undefined {
  const explicit = (element.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (explicit) {
    return explicit === 'presentation' || explicit === 'none' ? undefined : explicit;
  }
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case 'button':
      return 'button';
    case 'a':
    case 'area':
      return element.hasAttribute('href') ? 'link' : undefined;
    case 'select': {
      const select = element as HTMLSelectElement;
      return select.multiple || select.size > 1 ? 'listbox' : 'combobox';
    }
    case 'textarea':
      return 'textbox';
    case 'option':
      return 'option';
    case 'img':
      return element.getAttribute('alt') === '' ? undefined : 'img';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'input': {
      const type = (element.getAttribute('type') || '').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(type)) {
        return 'button';
      }
      if (type === 'checkbox' || type === 'radio') {
        return type;
      }
      if (type === 'range') {
        return 'slider';
      }
      if (type === 'number') {
        return 'spinbutton';
      }
      if (element.hasAttribute('list')) {
        return 'combobox';
      }
      if (type === 'search') {
        return 'searchbox';
      }
      return TEXTBOX_INPUT_TYPES.includes(type) ? 'textbox' : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Texte lu par un lecteur d'écran dans le contenu d'un élément : les parties masquées
 * (`aria-hidden`, icônes Material notamment) en sont exclues, les images comptent pour
 * leur texte alternatif.
 */
function contentText(element: Element, depth = 0): string {
  if (depth > MAX_TEXT_DEPTH) {
    return '';
  }
  let text = '';
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.nodeValue;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element;
      if (isHidden(childElement)) {
        continue;
      }
      const ariaLabel = childElement.getAttribute('aria-label');
      if (ariaLabel) {
        text += ` ${ariaLabel} `;
      } else if (childElement.tagName.toLowerCase() === 'img') {
        text += ` ${childElement.getAttribute('alt') || ''} `;
      } else {
        text += ` ${contentText(childElement, depth + 1)} `;
      }
    }
  }
  return text;
}

function labelledByText(element: Element): string {
  const ids = (element.getAttribute('aria-labelledby') || '').trim();
  if (!ids) {
    return '';
  }
  return normalizeLabel(
    ids
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id))
      .filter((label) => !!label)
      .map((label) => contentText(label))
      .join(' ')
  );
}

/** Libellé d'un champ : `aria-labelledby`, `aria-label`, puis `<label>` associé */
function fieldLabel(element: Element): string {
  const labelledBy = labelledByText(element);
  if (labelledBy) {
    return labelledBy;
  }
  const ariaLabel = normalizeLabel(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    return normalizeLabel(
      Array.from(labels)
        .map((label) => contentText(label))
        .join(' ')
    );
  }
  return '';
}

/** Nom accessible, pour les rôles que l'export désigne par `getByRole` */
export function computeName(element: Element, role: string): string {
  const labelledBy = labelledByText(element);
  if (labelledBy) {
    return labelledBy;
  }
  const ariaLabel = normalizeLabel(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (['button', 'submit', 'reset'].includes(type)) {
      return normalizeLabel((element as HTMLInputElement).value);
    }
    if (type === 'image') {
      return normalizeLabel(element.getAttribute('alt'));
    }
  }
  if (FIELD_TAGS.includes(tag)) {
    const label = fieldLabel(element);
    if (label) {
      return label;
    }
  }
  if (tag === 'img') {
    return normalizeLabel(element.getAttribute('alt'));
  }
  if (NAME_FROM_CONTENT.includes(role)) {
    const content = normalizeLabel(contentText(element));
    if (content) {
      return content;
    }
  }
  return normalizeLabel(element.getAttribute('title'));
}

/**
 * Rang de l'élément parmi les éléments visibles de même rôle et même nom, ou undefined
 * s'il est le seul. null si le décompte n'est pas fiable (élément introuvable parmi les
 * candidats, page trop chargée) : le rôle n'est alors pas proposé à l'export.
 */
function rankByRole(element: Element, role: string, name: string): number | undefined | null {
  const selector = ROLE_SELECTORS[role] ?? `[role~="${role}"]`;
  const candidates = Array.from(element.ownerDocument.querySelectorAll(selector));
  if (candidates.length > MAX_ROLE_CANDIDATES) {
    return null;
  }
  const matching = candidates.filter((candidate) => candidate === element || (computeRole(candidate) === role && isVisible(candidate) && computeName(candidate, role) === name));
  const index = matching.indexOf(element);
  if (index === -1) {
    return null;
  }
  return matching.length > 1 ? index : undefined;
}

/** Rang de l'élément parmi ceux qui affichent exactement le même texte */
function rankByText(element: Element, text: string): number | undefined | null {
  const matching = findAllByText(text);
  const index = matching.findIndex((candidate) => candidate === element || element.contains(candidate) || candidate.contains(element));
  if (index === -1) {
    return null;
  }
  return matching.length > 1 ? index : undefined;
}

function uniqueTestId(element: Element): string | undefined {
  const testId = element.getAttribute('data-testid');
  if (!testId) {
    return undefined;
  }
  const escaped = testId.replace(/["\\]/g, '\\$&');
  return element.ownerDocument.querySelectorAll(`[data-testid="${escaped}"]`).length === 1 ? testId : undefined;
}

/**
 * Décrit l'élément visé par une action. Ne lève jamais : un échec ne doit pas empêcher
 * l'enregistrement de l'action, qui reste rejouable par Tuello sans cette description.
 */
export function describeTarget(element: Element | null): ITargetDescriptor | undefined {
  if (!element || !element.tagName) {
    return undefined;
  }
  const tag = element.tagName.toLowerCase();
  const descriptor: ITargetDescriptor = { tag };
  try {
    descriptor.testId = uniqueTestId(element);

    if (tag === 'input') {
      descriptor.inputType = (element.getAttribute('type') || 'text').toLowerCase();
    }
    if (FIELD_TAGS.includes(tag)) {
      descriptor.label = fieldLabel(element) || undefined;
      descriptor.placeholder = normalizeLabel(element.getAttribute('placeholder')) || undefined;
    }

    // L'export préfère `data-testid`, puis le libellé d'un champ : inutile alors de compter
    // les homonymes, calcul le plus coûteux, refait à chaque frappe dans un champ.
    const designated = !!descriptor.testId || !!descriptor.label || !!descriptor.placeholder;

    const role = designated ? undefined : computeRole(element);
    if (role) {
      const name = computeName(element, role);
      if (name && name.length <= MAX_NAME_LENGTH) {
        const rank = rankByRole(element, role, name);
        if (rank !== null) {
          descriptor.role = role;
          descriptor.name = name;
          descriptor.roleNth = rank;
        }
      }
    }

    if (!designated && !descriptor.role && !FIELD_TAGS.includes(tag)) {
      const text = normalizeLabel(contentText(element));
      if (text && text.length <= MAX_NAME_LENGTH) {
        const rank = rankByText(element, text);
        if (rank !== null) {
          descriptor.text = text;
          descriptor.textNth = rank;
        }
      }
    }

    descriptor.selector = buildSelector(element) || undefined;
  } catch (error) {
    console.warn('Tuello: description de la cible impossible', error);
  }
  return descriptor;
}
