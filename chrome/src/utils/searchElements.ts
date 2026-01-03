import { HTML_TAGS } from '../constantes/htmlTags.constantes';

const TUELLO_PREFIX = 'tuello-search-';
const TUELLO_BADGE_ID = 'tuello-count-badge';
const TUELLO_STYLE_ID = 'tuello-animations';
const THEME_COLOR = '#D12566';

let elementsFound = new Map<string, HTMLElement>();
let mutationObserver: MutationObserver | null = null;
let debounceTimer: number | null = null;
let isInternalAction = false;
let scrollRafId: number | null = null;
let isScrolling = false;

// ==========================================
// INITIALISATION
// ==========================================

export function activateSearchElements() {
  stopObservers();
  injectStyles(); // Injecte l'animation CSS
  searchAndDisplay();

  window.addEventListener('resize', debounceSearch, { passive: true });
  // Utilise capture: true pour intercepter le scroll sur tous les éléments,
  // y compris les conteneurs scrollables (html/body en height: 100%)
  document.addEventListener('scroll', throttledRefreshPositions, { passive: true, capture: true });

  if (!mutationObserver) {
    mutationObserver = new MutationObserver((mutations) => {
      if (isInternalAction) return;

      const hasExternalChanges = mutations.some((mutation) => {
        const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
        return nodes.some((node) => node instanceof HTMLElement && !node.id.startsWith(TUELLO_PREFIX) && node.id !== TUELLO_BADGE_ID);
      });

      if (hasExternalChanges) debounceSearch();
    });

    if (document.body) {
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }
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
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => searchAndDisplay(), 300);
}

function searchAndDisplay() {
  isInternalAction = true;
  removeAllSearchElements();

  chrome.storage.local.get(['tuelloElements'], (results) => {
    const searchConfigs = results['tuelloElements'];
    if (!searchConfigs || !Array.isArray(searchConfigs)) {
      updateCountBadge(0);
      isInternalAction = false;
      return;
    }

    const fragment = document.createDocumentFragment();
    let totalFoundCount = 0;

    searchConfigs.forEach((config: any) => {
      const targetNodes = findElement(config.name);
      targetNodes.forEach((node, index) => {
        const htmlElt = node as HTMLElement;
        if (isVisible(htmlElt)) {
          const overlay = createOverlayElement(config, htmlElt, index);
          fragment.appendChild(overlay);
          totalFoundCount++;
        }
      });
    });

    document.body.appendChild(fragment);
    updateCountBadge(totalFoundCount);
    setTimeout(() => {
      isInternalAction = false;
    }, 100);
  });
}

// ==========================================
// RENDU & ANIMATION
// ==========================================

function createOverlayElement(config: any, target: HTMLElement, index: number): HTMLDivElement {
  const rect = target.getBoundingClientRect();
  const overlay = document.createElement('div');
  const uniqueId = `${TUELLO_PREFIX}${index}-${Math.random().toString(36).substring(2, 7)}`;

  overlay.id = uniqueId;
  overlay.className = 'tuello-animate tuello-overlay';
  elementsFound.set(uniqueId, target);

  // Utilise transform au lieu de left/top pour de meilleures performances GPU
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'auto',
    cursor: 'pointer',
    border: `2px dashed ${THEME_COLOR}`,
    left: '0',
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    willChange: 'transform',
    boxSizing: 'border-box',
    opacity: '0', // Sera géré par l'animation @keyframes
    contain: 'layout style' // Isolation CSS pour éviter les reflows
  });

  const attrValue = target.getAttribute(config.displayAttribute);
  overlay.title = `${config.name}${attrValue ? ' : ' + attrValue : ''} (Clic pour copier)`;

  overlay.onclick = (e) => {
    e.stopPropagation();
    copyToClipBoard(target, config.displayAttribute);
    target.click();
  };

  return overlay;
}

// Throttle intelligent : limite les mises à jour pendant le scroll
function throttledRefreshPositions() {
  if (scrollRafId !== null) return; // Déjà planifié

  scrollRafId = window.requestAnimationFrame(() => {
    refreshOverlayPositions();
    scrollRafId = null;
  });
}

function refreshOverlayPositions() {
  // Batch read : lire toutes les positions d'abord
  const updates: Array<{ overlay: HTMLElement; rect: DOMRect }> = [];

  elementsFound.forEach((target, id) => {
    const overlay = document.getElementById(id);
    if (overlay && target && target.isConnected) {
      updates.push({ overlay, rect: target.getBoundingClientRect() });
    }
  });

  // Batch write : appliquer toutes les transformations ensuite
  updates.forEach(({ overlay, rect }) => {
    overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  });
}

function updateCountBadge(count: number) {
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
  badge.textContent = `${count} élément(s) détecté(s)`;
}

// ==========================================
// NETTOYAGE & UTILITAIRES
// ==========================================

export function desactivateSearchElements() {
  stopObservers();
  removeAllSearchElements();
  const style = document.getElementById(TUELLO_STYLE_ID);
  if (style) style.remove();
}

export function removeAllSearchElements() {
  const existing = document.querySelectorAll(`[id^="${TUELLO_PREFIX}"], #${TUELLO_BADGE_ID}`);
  existing.forEach((el) => el.remove());
  elementsFound.clear();
}

function stopObservers() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  window.removeEventListener('resize', debounceSearch);
  document.removeEventListener('scroll', throttledRefreshPositions, { capture: true });
  if (debounceTimer) window.clearTimeout(debounceTimer);
  if (scrollRafId !== null) {
    window.cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
}

export function findElement(selector: string): Node[] {
  let results: Node[] = [];
  if (selector.includes('<') || HTML_TAGS.includes(selector)) {
    results = Array.from(document.getElementsByTagName(selector.replace(/[<>]/g, '')));
  } else if (selector.match(/^[a-zA-Z0-9_-]+$/)) {
    const byAttr = document.querySelectorAll(`[${selector}]`);
    results = byAttr.length > 0 ? Array.from(byAttr) : findByTextXPath(document.body, selector);
  }
  return results.slice(0, 200);
}

function findByTextXPath(root: HTMLElement, text: string): Node[] {
  const nodes: Node[] = [];
  const escaped = text.replace(/'/g, '&apos;');
  const xpath = `.//text()[contains(., '${escaped}') and not(ancestor::script) and not(ancestor::style)]`;
  try {
    const res = document.evaluate(xpath, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < res.snapshotLength; i++) {
      const parent = res.snapshotItem(i)?.parentElement;
      if (parent) nodes.push(parent);
    }
  } catch (e) {
    return [];
  }
  return [...new Set(nodes)];
}

function isVisible(el: HTMLElement) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

async function copyToClipBoard(target: HTMLElement, attr: string) {
  const text = target.getAttribute(attr) || target.innerText || '';
  if (!text) return;

  const nav = navigator as Navigator;
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
    } catch {
      // Silently fail - clipboard API peut échouer dans certains contextes
    }
  }
}
