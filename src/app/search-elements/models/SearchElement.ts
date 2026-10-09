/**
 * Façon d'interpréter `SearchElement.name` :
 * - tag / attribute / text / css : interprétation forcée
 * - auto : listes enregistrées avant l'ajout du type (plus proposé dans le panneau) :
 *   balise si `<x>` ou nom de balise connu, sinon attribut s'il existe dans la page, sinon texte
 */
export type SearchElementType = 'auto' | 'tag' | 'attribute' | 'text' | 'css';

/** Types proposés dans le panneau */
export const SEARCH_ELEMENT_TYPES: SearchElementType[] = ['tag', 'attribute', 'text', 'css'];

/**
 * Contenu de la pastille affichée sur chaque élément trouvé :
 * - name : ce qui est recherché (balise, nom d'attribut, texte, sélecteur)
 * - value : la valeur (attribut recherché, ou `displayAttribute` pour une balise / un sélecteur)
 * - both : les deux ; none : pas de pastille, seulement le cadre
 */
export type SearchElementDisplayMode = 'name' | 'value' | 'both' | 'none';

/** Modes d'affichage possibles selon le type : une recherche texte n'a pas de valeur */
export function getDisplayModes(type: SearchElementType): SearchElementDisplayMode[] {
  return type === 'text' ? ['name', 'none'] : ['name', 'value', 'both', 'none'];
}

/**
 * Clés de traduction du libellé d'un mode (« Balise », « Attribut + valeur »...), à joindre par « + »
 */
export function getDisplayModeLabelKeys(mode: SearchElementDisplayMode | undefined, type: SearchElementType = 'auto'): string[] {
  const nameKey = `mmn.search.display.name.${type}`;
  switch (mode) {
    case 'name':
      return [nameKey];
    case 'value':
      return ['mmn.search.display.value'];
    case 'both':
      return [nameKey, 'mmn.search.display.value'];
    case 'none':
      return ['mmn.search.display.none'];
    default:
      // Anciennes listes : valeur, sinon nom
      return ['mmn.search.type.auto'];
  }
}

/**
 * La valeur affichée vient de `displayAttribute` pour une balise ou un sélecteur CSS.
 * Pour un attribut, c'est la valeur de l'attribut recherché ; pour un texte, il n'y en a pas.
 */
export function usesDisplayAttribute(type: SearchElementType): boolean {
  return type === 'tag' || type === 'css' || type === 'auto';
}

/** Couleur des éléments enregistrés avant le choix de la couleur (couleur de Tuello) */
export const DEFAULT_SEARCH_COLOR = '#d12566';

/** Couleurs attribuées tour à tour aux éléments ajoutés : distinctes pour les repérer rapidement sur la page */
export const SEARCH_COLORS = [DEFAULT_SEARCH_COLOR, '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#e53935', '#3949ab', '#6d4c41', '#c0ca33'];

/** Première couleur de la palette non utilisée (la moins utilisée si toutes le sont) */
export function getNextSearchColor(elements: SearchElement[]): string {
  const counts = SEARCH_COLORS.map((color) => elements.filter((element) => (element.color || DEFAULT_SEARCH_COLOR).toLowerCase() === color).length);
  return SEARCH_COLORS[counts.indexOf(Math.min(...counts))];
}

/**
 * Élément recherché (partagé avec le content script, chrome/src/utils/searchElements.ts)
 */
export class SearchElement {
  name: string;
  displayAttribute: string;
  /** Absent sur les listes enregistrées avant l'ajout du type : équivaut à 'auto' */
  type?: SearchElementType;
  /** Absent sur les anciennes listes : valeur de displayAttribute, sinon le nom (ancien comportement) */
  displayMode?: SearchElementDisplayMode;
  /** Couleur du cadre et de la pastille (#rrggbb) ; absente sur les anciennes listes : DEFAULT_SEARCH_COLOR */
  color?: string;
}
