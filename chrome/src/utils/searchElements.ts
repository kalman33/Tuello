import { HTML_TAGS } from '../constantes/htmlTags.constantes';

const TUELLO_PREFIX = 'tuello-search-';
const TUELLO_BADGE_ID = 'tuello-count-badge';
const TUELLO_STYLE_ID = 'tuello-animations';
const THEME_COLOR = '#D12566';

let elementsFound = new Map<string, HTMLElement>();
let mutationObserver: MutationObserver | null = null;
let debounceTimer: number | null = null;
let isInternalAction = false;

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
  document.addEventListener('scroll', refreshCanvasPositions, { passive: true, capture: true });

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
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .tuello-animate {
      animation: tuelloFadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
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
          const canvas = createCanvasElement(config, htmlElt, index);
          fragment.appendChild(canvas);
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

function createCanvasElement(config: any, target: HTMLElement, index: number): HTMLCanvasElement {
  const rect = target.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  const uniqueId = `${TUELLO_PREFIX}${index}-${Math.random().toString(36).substr(2, 5)}`;

  canvas.id = uniqueId;
  canvas.className = 'tuello-animate'; // Active l'animation CSS
  elementsFound.set(uniqueId, target);

  Object.assign(canvas.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'auto',
    cursor: 'pointer',
    border: `2px dashed ${THEME_COLOR}`,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: 'border-box',
    opacity: '0' // Sera géré par l'animation @keyframes
  });

  const attrValue = target.getAttribute(config.displayAttribute);
  canvas.title = `${config.name}${attrValue ? ' : ' + attrValue : ''} (Clic pour copier)`;

  canvas.onclick = (e) => {
    e.stopPropagation();
    copyToClipBoard(target, config.displayAttribute);
    target.click();
  };

  return canvas;
}

function refreshCanvasPositions() {
  window.requestAnimationFrame(() => {
    elementsFound.forEach((target, id) => {
      const canvas = document.getElementById(id);
      if (canvas && target && target.isConnected) {
        const rect = target.getBoundingClientRect();
        canvas.style.left = `${rect.left}px`;
        canvas.style.top = `${rect.top}px`;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
    });
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
  document.removeEventListener('scroll', refreshCanvasPositions, { capture: true });
  if (debounceTimer) window.clearTimeout(debounceTimer);
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

function copyToClipBoard(target: HTMLElement, attr: string) {
  const text = target.getAttribute(attr) || target.innerText || '';
  if (!text) return;
  const nav = navigator as any;
  if (nav.clipboard && nav.clipboard.writeText) {
    nav.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  Object.assign(textArea.style, { position: 'fixed', left: '-9999px' });
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}
