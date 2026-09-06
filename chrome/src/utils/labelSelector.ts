/**
 * Sélection d'un élément par son libellé.
 *
 * Complète la sélection par coordonnées et par image : quand un élément change de
 * place d'une exécution à l'autre (les chiffres d'un code PIN mélangés à chaque
 * affichage), ni ses coordonnées ni sa position dans le DOM ne sont stables, mais
 * son texte l'est.
 */

/** Éléments susceptibles de porter réellement l'action du clic */
const CLICKABLE_SELECTOR = ['button', 'a', 'input', 'select', 'textarea', 'label', 'summary', '[role="button"]', '[role="link"]', '[role="option"]', '[role="menuitem"]', '[role="tab"]', '[role="checkbox"]', '[role="radio"]', '[onclick]'].join(',');

/** Balises dont le contenu textuel n'est jamais un libellé affiché */
const IGNORED_TAGS = ['script', 'style', 'noscript', 'template', 'head', 'title'];

/**
 * Normalise un libellé : les retours à la ligne et l'indentation du HTML ne sont
 * pas visibles à l'écran, ils ne doivent pas empêcher la correspondance.
 */
export function normalizeLabel(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Libellé lisible d'un élément : son texte, sinon ses attributs d'accessibilité
 * (une icône ou un champ n'ont pas de contenu textuel).
 */
export function extractLabel(element: Element | null): string {
  if (!element) {
    return '';
  }
  const text = normalizeLabel(element.textContent);
  if (text) {
    return text;
  }
  for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
    const value = normalizeLabel(element.getAttribute(attribute));
    if (value) {
      return value;
    }
  }
  return normalizeLabel((element as HTMLInputElement).value);
}

/**
 * Remonte de l'élément porteur du texte (souvent un `span`) vers celui qui traite
 * le clic (le `button` qui l'englobe).
 */
export function findClickableAncestor(element: Element | null): HTMLElement | null {
  if (!element) {
    return null;
  }
  return (element.closest(CLICKABLE_SELECTOR) as HTMLElement) ?? (element as HTMLElement);
}

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/**
 * Retrouve l'élément affichant ce libellé.
 *
 * Tous les ancêtres d'un élément partagent son texte : on ne garde que les
 * candidats les plus profonds, sinon le clic partait sur un conteneur. À égalité,
 * la balise enregistrée départage.
 */
export function findElementByLabel(label: string, tagName?: string): HTMLElement | null {
  const expected = normalizeLabel(label);
  if (!expected || !document.body) {
    return null;
  }

  const candidates: HTMLElement[] = [];
  for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    if (IGNORED_TAGS.includes(element.tagName.toLowerCase()) || element.id === 'iframeTuello') {
      continue;
    }
    if (extractLabel(element) !== expected || !isVisible(element)) {
      continue;
    }
    candidates.push(element);
  }

  if (candidates.length === 0) {
    return null;
  }

  const deepest = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)));
  const pool = deepest.length > 0 ? deepest : candidates;

  if (tagName) {
    const sameTag = pool.find((element) => element.tagName.toLowerCase() === tagName.toLowerCase());
    if (sameTag) {
      return sameTag;
    }
  }

  return pool[0];
}
