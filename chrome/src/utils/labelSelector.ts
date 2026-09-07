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
 * Éléments dont le libellé ne vient pas de leur texte : porteurs d'un attribut
 * d'accessibilité, ou champs de saisie dont c'est la valeur qui s'affiche.
 */
const LABEL_HOLDER_SELECTOR = '[aria-label],[title],[alt],[placeholder],input,textarea,select,button,option';

/** Nombre de libellés dont on garde l'élément résolu d'un rejeu à l'autre */
const CACHE_MAX_ENTRIES = 50;

/**
 * Dernier élément trouvé pour un libellé donné.
 *
 * Un scénario clique souvent plusieurs fois le même libellé (revenir sur un
 * onglet, ressaisir un code) : tant que l'élément est toujours dans la page et
 * porte toujours ce libellé, le rejouer ne demande aucun parcours du DOM. La
 * référence est faible pour ne pas retenir en mémoire les nœuds d'une page
 * quittée.
 */
const resolvedLabels = new Map<string, WeakRef<HTMLElement>>();

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

/** Un élément dont le texte ne peut pas être le libellé affiché n'est pas cliquable */
function isSelectable(element: Element): boolean {
  return !IGNORED_TAGS.includes(element.tagName.toLowerCase()) && element.id !== 'iframeTuello';
}

/**
 * Éléments dont le texte est exactement le libellé recherché.
 *
 * Le parcours part des nœuds texte et remonte vers leurs ancêtres, au lieu de
 * lire le `textContent` de chaque élément de la page : ce dernier reconstruit
 * tout le sous-arbre, et le faire pour chaque élément revenait à relire le texte
 * de la page autant de fois qu'elle a de niveaux d'imbrication. Ici chaque
 * caractère n'est lu qu'une fois pour le filtrage, et seuls les rares ancêtres
 * d'un texte compatible sont réellement examinés.
 */
function collectByText(expected: string, found: Set<HTMLElement>): void {
  // Sans fonction de filtre : appelée pour chaque nœud texte de la page, elle
  // coûterait plus cher que le tri fait ici.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const visited = new Set<Element>();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // L'indentation du HTML forme l'essentiel des nœuds texte d'une page :
    // `trim` les écarte sans passer par la normalisation, plus coûteuse.
    const raw = node.nodeValue ? node.nodeValue.trim() : '';
    if (!raw) {
      continue;
    }
    // Un élément portant le libellé contient forcément un nœud texte dont le
    // contenu en est un morceau : tout le reste est écarté sans remontée.
    const text = normalizeLabel(raw);
    if (text.length > expected.length || !expected.includes(text)) {
      continue;
    }

    for (let element = node.parentElement; element && element !== document.body; element = element.parentElement) {
      // Les frères partagent leurs ancêtres : ceux déjà examinés le restent.
      if (visited.has(element)) {
        break;
      }
      visited.add(element);

      const full = normalizeLabel(element.textContent);
      // Le texte ne fait que croître en remontant : au-delà du libellé attendu,
      // aucun ancêtre ne peut plus correspondre.
      if (full.length > expected.length) {
        break;
      }
      if (full === expected && isSelectable(element)) {
        // Les ancêtres partagent ce texte, mais ce sont des conteneurs : la
        // sélection ne garde de toute façon que les candidats les plus profonds.
        found.add(element);
        break;
      }
    }
  }
}

/**
 * Éléments dont le libellé vient d'un attribut ou de leur valeur saisie : ils
 * n'ont pas de texte, le parcours des nœuds texte ne peut pas les atteindre.
 */
function collectByAttribute(expected: string, found: Set<HTMLElement>): void {
  for (const element of Array.from(document.body.querySelectorAll<HTMLElement>(LABEL_HOLDER_SELECTOR))) {
    if (isSelectable(element) && extractLabel(element) === expected) {
      found.add(element);
    }
  }
}

/** Élément déjà résolu pour ce libellé, s'il est toujours affiché et inchangé */
function readCache(key: string, expected: string): HTMLElement | null {
  const element = resolvedLabels.get(key)?.deref();
  if (!element) {
    resolvedLabels.delete(key);
    return null;
  }
  if (!element.isConnected || extractLabel(element) !== expected || !isVisible(element)) {
    resolvedLabels.delete(key);
    return null;
  }
  return element;
}

function writeCache(key: string, element: HTMLElement): void {
  if (resolvedLabels.size >= CACHE_MAX_ENTRIES) {
    const oldest = resolvedLabels.keys().next();
    if (!oldest.done) {
      resolvedLabels.delete(oldest.value);
    }
  }
  resolvedLabels.set(key, new WeakRef(element));
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

  const key = `${tagName ? tagName.toLowerCase() : ''}|${expected}`;
  const cached = readCache(key, expected);
  if (cached) {
    return cached;
  }

  const found = new Set<HTMLElement>();
  collectByText(expected, found);
  collectByAttribute(expected, found);

  // La visibilité déclenche un calcul de mise en page : réservée aux candidats.
  const candidates = Array.from(found).filter(isVisible);
  if (candidates.length === 0) {
    return null;
  }
  // Les deux parcours ne se suivent pas : l'ordre du document départage comme
  // avant lorsque plusieurs éléments conviennent.
  candidates.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const deepest = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)));
  const pool = deepest.length > 0 ? deepest : candidates;

  const element = (tagName && pool.find((item) => item.tagName.toLowerCase() === tagName.toLowerCase())) || pool[0];
  writeCache(key, element);
  return element;
}
