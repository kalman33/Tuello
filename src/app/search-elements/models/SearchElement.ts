/**
 * Façon d'interpréter `SearchElement.name` :
 * - auto : balise si `<x>` ou nom de balise connu, sinon attribut s'il existe dans la page, sinon texte
 * - tag / attribute / text / css : interprétation forcée
 */
export type SearchElementType = 'auto' | 'tag' | 'attribute' | 'text' | 'css';

export const SEARCH_ELEMENT_TYPES: SearchElementType[] = ['auto', 'tag', 'attribute', 'text', 'css'];

/**
 * Élément recherché (partagé avec le content script, chrome/src/utils/searchElements.ts)
 */
export class SearchElement {
  name: string;
  displayAttribute: string;
  /** Absent sur les listes enregistrées avant l'ajout du type : équivaut à 'auto' */
  type?: SearchElementType;
}
