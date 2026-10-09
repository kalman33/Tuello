import { SearchElement, SearchElementType } from '../../../src/app/search-elements/models/SearchElement';
import { HTML_TAGS } from '../constantes/htmlTags.constantes';
import { DEBOUNCE_DELAY_MS } from './constants';

const TUELLO_PREFIX = 'tuello-search-';
const TUELLO_BADGE_ID = 'tuello-count-badge';
const TUELLO_STYLE_ID = 'tuello-animations';
/** Éléments de la recherche elle-même (overlays, badge, styles) */
const SEARCH_UI_SELECTOR = `[id^="${TUELLO_PREFIX}"], #${TUELLO_BADGE_ID}, #${TUELLO_STYLE_ID}`;
/**
 * Autres éléments injectés par Tuello (panneau, tags, suivi, toasts...) : ni résultats, ni déclencheurs
 * de recherche. #lightbox et #comment sont volontairement absents : ids trop courants sur les sites.
 */
const TUELLO_UI_SELECTOR = [SEARCH_UI_SELECTOR, '#iframeTuello', '#tuelloTags', '#mouseCoordinates', '#cover-spin', '#jsonViewerLightbox', '#tuello-toast', '#tuello-comment-banner', '[id^="tuelloTrack"]'].join(', ');
const THEME_COLOR = '#D12566';
const MAX_RESULTS_PER_SEARCH = 200;
/** Nom pouvant désigner un attribut en mode auto */
const ATTRIBUTE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
/** Délai max avant une recherche, même si la page ne cesse de muter (horloge, carrousel...) */
const SEARCH_MAX_WAIT_MS = 1000;
/** Attributs dont le changement peut masquer/afficher un élément ('style' exclu : trop bruyant sur les pages animées) */
const VISIBILITY_ATTRIBUTES = ['class', 'hidden', 'open'];
/** Éléments dont le texte n'est jamais affiché */
const TEXT_IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OverlayEntry {
  target: HTMLElement;
  config: SearchElement;
  overlay: HTMLDivElement;
  chip: HTMLDivElement;
  /** Ancêtres à overflow non visible : l'overlay est découpé à leur zone visible */
  clipAncestors: Element[];
  box: Box | null;
  copiedTimer: number | null;
}

// Overlays affichés, par config (clé : configKey) puis par élément ciblé
let overlayEntries = new Map<string, Map<HTMLElement, OverlayEntry>>();
let observedTargets = new Set<HTMLElement>();
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let debounceTimer: number | null = null;
let debounceStart: number | null = null;
let refreshRafId: number | null = null;
let overlayCounter = 0;
let lastBadgeCount = -1;
let isActive = false;
let syncStarted = false;
// Incrémenté à chaque recherche : seule la dernière lecture du storage est rendue
let searchGeneration = 0;

const i18n: Record<string, Record<string, string>> = {
  en: {
    'mmn.search.elements.found': 'element(s) found',
    'mmn.search.click.to.copy': 'Click to copy',
    'mmn.search.copied': 'Copied'
  },
  fr: {
    'mmn.search.elements.found': 'élément(s) détecté(s)',
    'mmn.search.click.to.copy': 'Clic pour copier',
    'mmn.search.copied': 'Copié'
  }
};
let currentLang = 'fr';

function translate(key: string): string {
  return i18n[currentLang]?.[key] || i18n['en'][key];
}

// ==========================================
// INITIALISATION
// ==========================================

/**
 * Suit les réglages dans chrome.storage : tous les onglets ouverts (pas seulement
 * celui du panneau) appliquent l'activation, la liste des éléments et la langue.
 */
export function initSearchElementsSync() {
  if (syncStarted) return;
  syncStarted = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes['searchElementsActivated']) {
      if (changes['searchElementsActivated'].newValue) {
        // Tuello peut être désactivé globalement : on ne réactive pas la recherche dans ce cas
        chrome.storage.local.get(['disabled'], (result: Record<string, any>) => {
          if (!result['disabled']) activateSearchElements();
        });
      } else {
        desactivateSearchElements();
      }
      return;
    }
    if (!isActive) return;
    if (changes['tuelloElements']) {
      // Relance complète : l'attributeFilter du MutationObserver dépend des noms recherchés
      activateSearchElements();
    } else if (changes['language']) {
      currentLang = (changes['language'].newValue as string) || 'fr';
      lastBadgeCount = -1;
      searchAndDisplay();
    }
  });
}

export function activateSearchElements() {
  stopObservers();

  // Le content script tourne en document_start : body/head peuvent ne pas exister encore
  if (!document.body || !document.head) {
    document.addEventListener('DOMContentLoaded', activateSearchElements, { once: true });
    return;
  }

  isActive = true;
  injectStyles(); // Injecte l'animation CSS

  // Récupère la langue configurée et les attributs recherchés (à surveiller)
  chrome.storage.local.get(['language', 'tuelloElements'], (result: Record<string, any>) => {
    if (!isActive) return;
    currentLang = result['language'] || 'fr';
    startMutationObserver(result['tuelloElements']);
    searchAndDisplay();
  });

  resizeObserver = new ResizeObserver(scheduleRefresh);
  // Le redimensionnement déplace les overlays (rafraîchi tout de suite) et peut
  // afficher/masquer des éléments via les media queries (recherche différée)
  window.addEventListener('resize', onWindowResize, { passive: true });
  // Utilise capture: true pour intercepter le scroll sur tous les éléments,
  // y compris les conteneurs scrollables (html/body en height: 100%)
  document.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true });
  // Un élément déplacé par une transition/animation CSS ne déclenche ni scroll ni mutation observée
  document.addEventListener('transitionend', scheduleRefresh, { passive: true, capture: true });
  document.addEventListener('animationend', scheduleRefresh, { passive: true, capture: true });
}

function onWindowResize() {
  scheduleRefresh();
  debounceSearch();
}

function startMutationObserver(searchConfigs: unknown) {
  if (mutationObserver) return;
  // Les noms recherchés peuvent être des attributs : leur ajout/retrait doit relancer la recherche
  const searchedNames = Array.isArray(searchConfigs) ? searchConfigs.reduce((names: string[], config) => names.concat(getWatchedAttributes(config)), []) : [];

  // Nos propres overlays/badge sont filtrés ici plutôt que d'ignorer toute mutation
  // pendant le rendu : les changements de la page survenant au même moment ne sont plus perdus
  mutationObserver = new MutationObserver((mutations) => {
    const hasExternalChanges = mutations.some((mutation) => {
      if (isTuelloNode(mutation.target)) return false;
      if (mutation.type === 'childList') {
        return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) => !isTuelloNode(node));
      }
      return true;
    });

    if (hasExternalChanges) debounceSearch();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...new Set([...VISIBILITY_ATTRIBUTES, ...searchedNames])]
  });
}

/** Attributs dont l'ajout/retrait peut changer le résultat de cette config */
function getWatchedAttributes(config: SearchElement): string[] {
  const name = typeof config?.name === 'string' ? config.name.trim() : '';
  if (!name) return [];
  switch (config.type ?? 'auto') {
    case 'attribute':
      return [name];
    case 'auto':
      return ATTRIBUTE_NAME_PATTERN.test(name) ? [name] : [];
    case 'css': {
      // Attributs cités dans le sélecteur ([data-x], [href^=...]) + id (#x)
      const names = ['id'];
      const pattern = /\[\s*([^\s\]=~|^$*]+)/g;
      for (let match = pattern.exec(name); match; match = pattern.exec(name)) names.push(match[1]);
      return names;
    }
    default:
      return [];
  }
}

function isTuelloNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return !!element?.closest(TUELLO_UI_SELECTOR);
}

function injectStyles() {
  if (document.getElementById(TUELLO_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TUELLO_STYLE_ID;
  style.textContent = `
    @keyframes tuelloFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .tuello-animate {
      animation: tuelloFadeIn 0.2s ease-out forwards;
    }
    .tuello-overlay {
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// LOGIQUE DE RECHERCHE
// ==========================================

function debounceSearch() {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  if (debounceStart === null) debounceStart = Date.now();
  // Le délai repart à chaque mutation, mais jamais au-delà de SEARCH_MAX_WAIT_MS
  const remainingMaxWait = SEARCH_MAX_WAIT_MS - (Date.now() - debounceStart);
  debounceTimer = window.setTimeout(runPendingSearch, Math.max(0, Math.min(DEBOUNCE_DELAY_MS, remainingMaxWait)));
}

function runPendingSearch() {
  debounceTimer = null;
  debounceStart = null;
  searchAndDisplay();
}

function configKey(config: SearchElement, index: number): string {
  return `${index}|${config?.type ?? 'auto'}|${config?.name}|${config?.displayAttribute}`;
}

function searchAndDisplay() {
  const generation = ++searchGeneration;

  chrome.storage.local.get(['tuelloElements'], (results) => {
    // Désactivé entre-temps, ou une recherche plus récente est en cours
    if (!isActive || generation !== searchGeneration) return;

    const searchConfigs = Array.isArray(results['tuelloElements']) ? results['tuelloElements'] : [];
    const nextEntries = new Map<string, Map<HTMLElement, OverlayEntry>>();
    const clipCache = new Map<Element, boolean>();
    const fragment = document.createDocumentFragment();

    // Les overlays d'éléments toujours trouvés sont conservés : pas de clignotement à chaque mutation
    searchConfigs.forEach((config: SearchElement, index: number) => {
      const key = configKey(config, index);
      const previous = overlayEntries.get(key);
      const current = new Map<HTMLElement, OverlayEntry>();
      // Filtre de visibilité avant la limite : sinon 200 éléments masqués suffisent à tout cacher
      const targets = findElement(config?.name, config?.type)
        .filter((node) => isVisible(node as HTMLElement))
        .slice(0, MAX_RESULTS_PER_SEARCH) as HTMLElement[];

      targets.forEach((target) => {
        let entry = previous?.get(target);
        if (entry) {
          previous.delete(target);
        } else {
          entry = createOverlayEntry(config, target);
          fragment.appendChild(entry.overlay);
        }
        entry.clipAncestors = getClipAncestors(target, clipCache);
        updateLabel(entry);
        current.set(target, entry);
      });
      nextEntries.set(key, current);
    });

    // Restes : éléments disparus ou configs supprimées
    overlayEntries.forEach((entries) => entries.forEach(removeEntry));
    overlayEntries = nextEntries;
    document.body.appendChild(fragment);
    syncResizeObserver();
    refreshOverlayPositions();
  });
}

// ==========================================
// RENDU & ANIMATION
// ==========================================

function createOverlayEntry(config: SearchElement, target: HTMLElement): OverlayEntry {
  const overlay = document.createElement('div');
  overlay.id = `${TUELLO_PREFIX}${overlayCounter++}`;
  overlay.className = 'tuello-animate tuello-overlay';

  // Le cadre laisse passer les clics vers la page : seule la pastille est interactive
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'none',
    border: `2px dashed ${THEME_COLOR}`,
    left: '0',
    top: '0',
    display: 'none', // Positionné par refreshOverlayPositions
    willChange: 'transform',
    boxSizing: 'border-box',
    opacity: '0', // Sera géré par l'animation @keyframes
    contain: 'layout style' // Isolation CSS pour éviter les reflows
  });

  const chip = document.createElement('div');
  Object.assign(chip.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '1px 5px',
    backgroundColor: THEME_COLOR,
    color: 'white',
    fontFamily: 'Segoe UI, Roboto, sans-serif',
    fontSize: '10px',
    lineHeight: '14px',
    borderBottomRightRadius: '4px',
    pointerEvents: 'auto',
    cursor: 'copy'
  });
  overlay.appendChild(chip);

  const entry: OverlayEntry = { target, config, overlay, chip, clipAncestors: [], box: null, copiedTimer: null };
  chip.addEventListener('click', (e) => {
    // Pas de target.click() : copier ne doit pas déclencher d'action sur la page
    e.preventDefault();
    e.stopPropagation();
    copyToClipBoard(entry);
  });
  return entry;
}

function updateLabel(entry: OverlayEntry) {
  if (entry.copiedTimer !== null) return; // « Copié » reste affiché jusqu'à la fin de son délai
  const attrValue = entry.config?.displayAttribute ? entry.target.getAttribute(entry.config.displayAttribute) : null;
  const label = attrValue || entry.config?.name || '';
  const title = `${entry.config?.name}${attrValue ? ' : ' + attrValue : ''} (${translate('mmn.search.click.to.copy')})`;
  if (entry.chip.textContent !== label) entry.chip.textContent = label;
  if (entry.chip.title !== title) entry.chip.title = title;
}

function removeEntry(entry: OverlayEntry) {
  if (entry.copiedTimer !== null) window.clearTimeout(entry.copiedTimer);
  entry.overlay.remove();
}

function syncResizeObserver() {
  const targets = new Set<HTMLElement>();
  overlayEntries.forEach((entries) => entries.forEach((entry) => targets.add(entry.target)));
  observedTargets.forEach((target) => {
    if (!targets.has(target)) resizeObserver?.unobserve(target);
  });
  targets.forEach((target) => {
    if (!observedTargets.has(target)) resizeObserver?.observe(target);
  });
  observedTargets = targets;
}

/** Ancêtres qui découpent leur contenu (overflow ≠ visible), jusqu'au body exclu */
function getClipAncestors(target: HTMLElement, cache: Map<Element, boolean>): Element[] {
  const ancestors: Element[] = [];
  for (let el = target.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    let clips = cache.get(el);
    if (clips === undefined) {
      const style = getComputedStyle(el);
      clips = style.overflowX !== 'visible' || style.overflowY !== 'visible';
      cache.set(el, clips);
    }
    if (clips) ancestors.push(el);
  }
  return ancestors;
}

// Throttle : au plus un recalcul des positions par frame
function scheduleRefresh() {
  if (refreshRafId !== null) return; // Déjà planifié

  refreshRafId = window.requestAnimationFrame(() => {
    refreshRafId = null;
    refreshOverlayPositions();
  });
}

function intersect(box: Box, rect: DOMRect): Box {
  const x = Math.max(box.x, rect.left);
  const y = Math.max(box.y, rect.top);
  const right = Math.min(box.x + box.w, rect.right);
  const bottom = Math.min(box.y + box.h, rect.bottom);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function refreshOverlayPositions() {
  // Batch read : lire toutes les positions d'abord
  const updates: Array<{ entry: OverlayEntry; box: Box | null }> = [];
  let visibleCount = 0;

  overlayEntries.forEach((entries) =>
    entries.forEach((entry) => {
      if (!entry.target.isConnected) {
        updates.push({ entry, box: null });
        return;
      }
      const rect = entry.target.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) {
        // Masqué sans mutation observée (ex. style display:none) : ResizeObserver nous a prévenus
        updates.push({ entry, box: null });
        return;
      }
      visibleCount++;
      let box: Box = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      for (const ancestor of entry.clipAncestors) {
        box = intersect(box, ancestor.getBoundingClientRect());
      }
      updates.push({ entry, box: box.w > 0 && box.h > 0 ? box : null });
    })
  );

  // Batch write : n'écrire que ce qui a changé
  updates.forEach(({ entry, box }) => {
    const previous = entry.box;
    entry.box = box;
    const style = entry.overlay.style;
    if (!box) {
      if (previous) style.display = 'none';
      return;
    }
    if (!previous) style.display = '';
    if (!previous || previous.x !== box.x || previous.y !== box.y) {
      style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    }
    if (!previous || previous.w !== box.w) style.width = `${box.w}px`;
    if (!previous || previous.h !== box.h) style.height = `${box.h}px`;
  });

  updateCountBadge(visibleCount);
}

function updateCountBadge(count: number) {
  if (count === lastBadgeCount && (count === 0 || document.getElementById(TUELLO_BADGE_ID))) return;
  lastBadgeCount = count;
  let badge = document.getElementById(TUELLO_BADGE_ID);
  if (count === 0) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('div');
    badge.id = TUELLO_BADGE_ID;
    badge.className = 'tuello-animate';
    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: THEME_COLOR,
      color: 'white',
      padding: '10px 16px',
      borderRadius: '30px',
      zIndex: '2147483647',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    document.body.appendChild(badge);
  }
  badge.textContent = `${count} ${translate('mmn.search.elements.found')}`;
}

// ==========================================
// NETTOYAGE & UTILITAIRES
// ==========================================

export function desactivateSearchElements() {
  isActive = false;
  stopObservers();
  removeAllSearchElements();
  const style = document.getElementById(TUELLO_STYLE_ID);
  if (style) style.remove();
}

export function removeAllSearchElements() {
  overlayEntries.forEach((entries) => entries.forEach(removeEntry));
  overlayEntries.clear();
  observedTargets.forEach((target) => resizeObserver?.unobserve(target));
  observedTargets.clear();
  lastBadgeCount = -1;
  const existing = document.querySelectorAll(`[id^="${TUELLO_PREFIX}"], #${TUELLO_BADGE_ID}`);
  existing.forEach((el) => el.remove());
}

function stopObservers() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  observedTargets.clear();
  document.removeEventListener('DOMContentLoaded', activateSearchElements);
  window.removeEventListener('resize', onWindowResize);
  document.removeEventListener('scroll', scheduleRefresh, { capture: true });
  document.removeEventListener('transitionend', scheduleRefresh, { capture: true });
  document.removeEventListener('animationend', scheduleRefresh, { capture: true });
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = null;
  debounceStart = null;
  if (refreshRafId !== null) {
    window.cancelAnimationFrame(refreshRafId);
    refreshRafId = null;
  }
}

export function findElement(selector: string, type: SearchElementType = 'auto'): Node[] {
  if (typeof selector !== 'string' || !selector.trim()) {
    return [];
  }
  selector = selector.trim();
  return findByType(selector, type).filter((node) => !isTuelloNode(node));
}

function findByType(selector: string, type: SearchElementType): Node[] {
  switch (type) {
    case 'tag':
      return findByTag(selector);
    case 'attribute':
      return findByAttribute(selector);
    case 'text':
      return findByText(document.body, selector);
    case 'css':
      return querySelectorAllSafe(selector);
    default: {
      if (selector.includes('<') || HTML_TAGS.includes(selector)) {
        return findByTag(selector);
      }
      if (ATTRIBUTE_NAME_PATTERN.test(selector)) {
        const byAttr = findByAttribute(selector);
        if (byAttr.length > 0) return byAttr;
      }
      // Tout le reste (espaces, accents, ponctuation...) est cherché comme texte
      return findByText(document.body, selector);
    }
  }
}

/** `h1`, `<h1>` ou `<div class="x">` : seul le nom de balise est retenu */
function findByTag(selector: string): Node[] {
  const tagName = selector.replace(/[<>/]/g, ' ').trim().split(/\s+/)[0];
  return tagName ? Array.from(document.getElementsByTagName(tagName)) : [];
}

function findByAttribute(name: string): Node[] {
  // CSS.escape : un nom commençant par un chiffre (ex. "123") rendrait le sélecteur invalide
  return querySelectorAllSafe(`[${CSS.escape(name)}]`);
}

function querySelectorAllSafe(selector: string): Node[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    // Sélecteur invalide : aucun résultat plutôt qu'interrompre tout le rendu
    return [];
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Éléments dont un nœud texte contient `text` (insensible à la casse et aux espaces multiples).
 * Un TreeWalker évite les problèmes d'échappement d'XPath et saute les sous-arbres non affichés.
 */
function findByText(root: HTMLElement, text: string): Node[] {
  const needle = normalizeText(text);
  const nodes = new Set<Element>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        return TEXT_IGNORED_TAGS.has(element.tagName) || isTuelloNode(element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement && normalizeText(node.nodeValue || '').includes(needle)) {
      nodes.add(node.parentElement);
    }
  }
  return [...nodes];
}

function isVisible(el: HTMLElement) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

async function copyToClipBoard(entry: OverlayEntry) {
  const attr = entry.config?.displayAttribute;
  const text = (attr && entry.target.getAttribute(attr)) || entry.target.innerText || '';
  if (!text) return;

  try {
    await (navigator as Navigator).clipboard.writeText(text);
  } catch {
    // L'API clipboard peut être refusée (iframe sans permission, page non focus...)
    return;
  }
  // Retour visuel : la pastille affiche « Copié » un instant
  if (entry.copiedTimer !== null) window.clearTimeout(entry.copiedTimer);
  entry.chip.textContent = `✓ ${translate('mmn.search.copied')}`;
  entry.copiedTimer = window.setTimeout(() => {
    entry.copiedTimer = null;
    updateLabel(entry);
  }, 1200);
}
