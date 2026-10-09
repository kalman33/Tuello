import { DEFAULT_SEARCH_COLOR, SearchElement, SearchElementType, usesDisplayAttribute } from '../../../src/app/search-elements/models/SearchElement';
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
/** Largeur max de la pastille : indépendante de la largeur de l'élément trouvé */
const CHIP_MAX_WIDTH = 400;
/** Hauteur de la pastille (lineHeight + padding) : sert à la placer hors du cadre */
const CHIP_HEIGHT = 16;
/** Durée pendant laquelle le compteur reste caché après avoir été survolé */
const BADGE_HIDDEN_MS = 2000;
/** Durée des animations de disparition/réapparition du compteur */
const BADGE_FADE_MS = 300;
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
  /** Pastille déplacée hors du cadre (survolée) : l'élément qu'elle recouvrait redevient cliquable */
  chipMoved: boolean;
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
let hideCount = false;
// Compteur survolé : caché pendant BADGE_HIDDEN_MS pour voir et cliquer ce qu'il recouvre
let badgeHiddenTimer: number | null = null;
let lastMouse: { x: number; y: number } | null = null;
// Entrées dont la pastille est déplacée : remise en place quand la souris quitte le cadre
const movedChips = new Set<OverlayEntry>();
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
    } else if (changes['searchElementsHideCount']) {
      hideCount = !!changes['searchElementsHideCount'].newValue;
      lastBadgeCount = -1;
      refreshOverlayPositions();
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
  chrome.storage.local.get(['language', 'tuelloElements', 'searchElementsHideCount'], (result: Record<string, any>) => {
    if (!isActive) return;
    currentLang = result['language'] || 'fr';
    hideCount = !!result['searchElementsHideCount'];
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
  return `${index}|${config?.type ?? 'auto'}|${config?.name}|${config?.displayAttribute}|${config?.displayMode}`;
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
          // La couleur ne fait pas partie de la clé : l'overlay est conservé et recoloré
          entry.config = config;
          applyColor(entry);
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
    // max-content : sans cela la largeur dépend de celle de l'élément trouvé, et le libellé
    // d'un élément étroit est tronqué alors que la place ne manque pas sur la page
    width: 'max-content',
    maxWidth: `${CHIP_MAX_WIDTH}px`,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '1px 5px',
    fontFamily: 'Segoe UI, Roboto, sans-serif',
    fontSize: '10px',
    lineHeight: '14px',
    borderRadius: '0 0 4px 0',
    pointerEvents: 'auto',
    cursor: 'copy'
  });
  overlay.appendChild(chip);

  const entry: OverlayEntry = { target, config, overlay, chip, clipAncestors: [], box: null, copiedTimer: null, chipMoved: false };
  applyColor(entry);
  // La pastille masque le haut de l'élément : survolée, elle sort du cadre pour libérer le clic
  chip.addEventListener('mouseenter', () => moveChip(entry));
  chip.addEventListener('click', (e) => {
    // Pas de target.click() : copier ne doit pas déclencher d'action sur la page
    e.preventDefault();
    e.stopPropagation();
    copyToClipBoard(entry);
  });
  return entry;
}

function getColor(config: SearchElement): string {
  return /^#[0-9a-f]{6}$/i.test(config?.color || '') ? config.color : DEFAULT_SEARCH_COLOR;
}

/** Texte noir ou blanc selon la clarté du fond (luminance relative WCAG) */
function getTextColor(background: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(background.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000' : '#fff';
}

function applyColor(entry: OverlayEntry) {
  const color = getColor(entry.config);
  // style.border est normalisé en rgb() par le navigateur : la couleur appliquée est mémorisée à part
  if (entry.overlay.dataset['color'] === color) return;
  entry.overlay.dataset['color'] = color;
  entry.overlay.style.border = `2px dashed ${color}`;
  entry.chip.style.backgroundColor = color;
  entry.chip.style.color = getTextColor(color);
}

/** Place la pastille au-dessus du cadre (en dessous si l'élément touche le haut de la fenêtre) */
function moveChip(entry: OverlayEntry) {
  if (entry.chipMoved || !entry.box) return;
  entry.chipMoved = true;
  const above = entry.box.y >= CHIP_HEIGHT;
  Object.assign(entry.chip.style, {
    top: above ? `-${CHIP_HEIGHT}px` : '100%',
    borderRadius: above ? '4px 4px 0 0' : '0 0 4px 4px'
  });
  if (!movedChips.size) document.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
  movedChips.add(entry);
}

function restoreChip(entry: OverlayEntry) {
  if (!entry.chipMoved) return;
  entry.chipMoved = false;
  Object.assign(entry.chip.style, { top: '0', borderRadius: '0 0 4px 0' });
  movedChips.delete(entry);
  if (!movedChips.size) document.removeEventListener('mousemove', onMouseMove, { capture: true });
}

function contains(rect: { left: number; top: number; right: number; bottom: number }, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** La pastille reste déplacée tant que la souris est sur le cadre ou sur la pastille elle-même (pour copier) */
function onMouseMove(e: MouseEvent) {
  movedChips.forEach((entry) => {
    const box = entry.box;
    const onBox = !!box && contains({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h }, e.clientX, e.clientY);
    if (!onBox && !contains(entry.chip.getBoundingClientRect(), e.clientX, e.clientY)) restoreChip(entry);
  });
}

/** Valeur associée à l'élément trouvé : attribut recherché, ou displayAttribute (balise, sélecteur) */
function getDisplayValue(entry: OverlayEntry): string | null {
  const config = entry.config;
  const type = config?.type ?? 'auto';
  const attribute = type === 'attribute' ? config.name?.trim() : usesDisplayAttribute(type) ? config?.displayAttribute?.trim() : '';
  return attribute ? entry.target.getAttribute(attribute) : null;
}

/** Nom affiché : `<h1>` pour une balise, le nom recherché sinon */
function getDisplayName(config: SearchElement): string {
  const name = config?.name?.trim() || '';
  return config?.type === 'tag' ? `<${name.replace(/[<>/]/g, ' ').trim().split(/\s+/)[0]}>` : name;
}

function getLabel(entry: OverlayEntry, value: string | null): string {
  const name = getDisplayName(entry.config);
  switch (entry.config?.displayMode) {
    case 'none':
      return '';
    case 'name':
      return name;
    case 'value':
      return value || '';
    case 'both':
      return value ? `${name} : ${value}` : name;
    default:
      // Anciennes listes sans displayMode : valeur si présente, sinon le nom
      return value || entry.config?.name || '';
  }
}

function updateLabel(entry: OverlayEntry) {
  if (entry.copiedTimer !== null) return; // « Copié » reste affiché jusqu'à la fin de son délai
  const value = getDisplayValue(entry);
  const label = getLabel(entry, value);
  const title = `${getDisplayName(entry.config)}${value ? ' : ' + value : ''} (${translate('mmn.search.click.to.copy')})`;
  // Pas de libellé (mode « aucun » ou valeur absente) : pas de pastille, seulement le cadre
  const display = label ? '' : 'none';
  if (entry.chip.style.display !== display) entry.chip.style.display = display;
  if (entry.chip.textContent !== label) entry.chip.textContent = label;
  if (entry.chip.title !== title) entry.chip.title = title;
}

function removeEntry(entry: OverlayEntry) {
  if (entry.copiedTimer !== null) window.clearTimeout(entry.copiedTimer);
  restoreChip(entry);
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
      restoreChip(entry);
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

function updateCountBadge(visibleCount: number) {
  // Compteur masqué par l'utilisateur : traité comme « aucun élément » (badge retiré)
  const count = hideCount ? 0 : visibleCount;
  if (count === lastBadgeCount && (count === 0 || document.getElementById(TUELLO_BADGE_ID))) return;
  lastBadgeCount = count;
  let badge = document.getElementById(TUELLO_BADGE_ID);
  if (count === 0) {
    removeBadge();
    return;
  }
  if (!badge) {
    badge = document.createElement('div');
    badge.id = TUELLO_BADGE_ID;
    badge.className = 'tuello-animate';
    Object.assign(badge.style, {
      opacity: '1',
      transform: 'none',
      transition: `opacity ${BADGE_FADE_MS}ms ease, transform ${BADGE_FADE_MS}ms ease`,
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: THEME_COLOR,
      color: 'white',
      padding: '10px 16px',
      borderRadius: '30px',
      // Sous l'iframe Tuello (2147483647) et les cadres de recherche (2147483646)
      zIndex: '2147483645',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    document.body.appendChild(badge);
    // Le compteur laisse passer les clics (pointer-events: none) : pas de mouseenter, le survol est détecté ici
    document.addEventListener('mousemove', onBadgeMouseMove, { passive: true, capture: true });
  }
  badge.textContent = `${count} ${translate('mmn.search.elements.found')}`;
}

function removeBadge() {
  document.removeEventListener('mousemove', onBadgeMouseMove, { capture: true });
  if (badgeHiddenTimer !== null) window.clearTimeout(badgeHiddenTimer);
  badgeHiddenTimer = null;
  lastMouse = null;
  document.getElementById(TUELLO_BADGE_ID)?.remove();
}

function isMouseOverBadge(badge: HTMLElement): boolean {
  return !!lastMouse && contains(badge.getBoundingClientRect(), lastMouse.x, lastMouse.y);
}

function onBadgeMouseMove(e: MouseEvent) {
  lastMouse = { x: e.clientX, y: e.clientY };
  const badge = document.getElementById(TUELLO_BADGE_ID);
  if (!badge || badgeHiddenTimer !== null || !isMouseOverBadge(badge)) return;
  // L'animation d'apparition (fill-mode forwards) l'emporterait sur l'opacité en ligne
  badge.classList.remove('tuello-animate');
  badge.style.opacity = '0';
  badge.style.transform = 'translateY(10px) scale(0.9)';
  badgeHiddenTimer = window.setTimeout(showBadgeAgain, BADGE_HIDDEN_MS);
}

function showBadgeAgain() {
  const badge = document.getElementById(TUELLO_BADGE_ID);
  // Souris toujours à cet endroit : il reste caché, sinon il réapparaîtrait sous le curseur
  if (badge && isMouseOverBadge(badge)) {
    badgeHiddenTimer = window.setTimeout(showBadgeAgain, BADGE_HIDDEN_MS);
    return;
  }
  badgeHiddenTimer = null;
  if (!badge) return;
  badge.style.opacity = '1';
  badge.style.transform = 'none';
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
  removeBadge();
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
  const text = getDisplayValue(entry) || entry.target.innerText || '';
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
