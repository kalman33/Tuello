import { HTML_TAGS } from "../constantes/htmlTags.constantes";
import { SearchElement } from "../models/SearchElement";

let elementsFound = new Map<string, Element>();
let intersectionObserver;
let resizeObserver;

// Debounce function to limit the rate at which a function gets called.
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function activateSearchElements() {
    removeAllSearchElements();
    searchElements();
    window.addEventListener("resize", debouncedResize);

    // Use IntersectionObserver to only draw outlines for visible elements.
    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const canvasId = `tuelloSearchElement-${entry.target.getAttribute('data-tuello-id')}`;
            const canvas = document.getElementById(canvasId);
            if (entry.isIntersecting) {
                if (!canvas) {
                    const searchElement = JSON.parse(entry.target.getAttribute('data-tuello-search-element'));
                    createCanvas(searchElement, entry.target, entry.target.getAttribute('data-tuello-id'));
                }
            } else {
                if (canvas) {
                    canvas.remove();
                }
            }
        });
    }, { root: null, threshold: 0.1 });

    // Use ResizeObserver to update canvas position on element resize.
    resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const canvasId = `tuelloSearchElement-${entry.target.getAttribute('data-tuello-id')}`;
            const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
            if (canvas) {
                const rect = entry.target.getBoundingClientRect();
                canvas.style.left = `${rect.left}px`;
                canvas.style.top = `${rect.top}px`;
                canvas.width = rect.width;
                canvas.height = rect.height;
            }
        }
    });
}

const debouncedResize = debounce(() => {
    removeAllSearchElements();
    searchElements();
}, 250);

export function desactivateSearchElements() {
    elementsFound = new Map<string, Element>();
    removeAllSearchElements();
    window.removeEventListener('resize', debouncedResize);
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
    }
}

function searchElements() {
    chrome.storage.local.get(['tuelloElements'], results => {
        const elements = results['tuelloElements'];
        if (elements) {
            elements.forEach((element, index) => {
                const nodes = findElement(element.name);
                nodes.forEach((node: Node) => {
                    const htmlElt = (node as HTMLElement);
                    const uniqueId = `${index}-${Math.random().toString(36).substr(2, 9)}`;
                    htmlElt.setAttribute('data-tuello-id', uniqueId);
                    htmlElt.setAttribute('data-tuello-search-element', JSON.stringify(element));
                    intersectionObserver.observe(htmlElt);
                    resizeObserver.observe(htmlElt);
                });
            });
        }
    });
}

export function removeAllSearchElements() {
    elementsFound.forEach((element: HTMLElement) => {
        intersectionObserver.unobserve(element);
        resizeObserver.unobserve(element);
    });
    elementsFound = new Map<string, Element>();
    const canvases = document.querySelectorAll('[id^="tuelloSearchElement"]');
    canvases.forEach(canvas => canvas.remove());
}

export function findElement(element: string): Node[] {
    if (element.includes('<') || HTML_TAGS.find(e => e === element)) {
        return Array.from(document.querySelectorAll(element.replace(/[<>]/g, '')));
    } else {
        const elts = document.querySelectorAll(`[${element}]`);
        if (elts.length > 0) {
            return Array.from(elts);
        } else {
            return findByText(document.body, element);
        }
    }
}

export function findByText(rootElement, text): Node[] {
    const nodes = [];
    // Use XPath to find text nodes containing the specified text.
    const iterator = document.evaluate(`//text()[contains(., '${text}')]`, rootElement, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let currentNode = iterator.iterateNext();
    while (currentNode) {
        nodes.push(currentNode.parentNode);
        currentNode = iterator.iterateNext();
    }
    return nodes;
}

function createCanvas(searchElement: SearchElement, htmlElt: Element, id: string) {
    const rect = htmlElt.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Don't create canvas for non-visible elements

    const canvas = document.createElement('canvas');
    canvas.id = `tuelloSearchElement-${id}`;
    elementsFound.set(canvas.id, htmlElt);
    canvas.title = `${searchElement.name} : ${htmlElt.getAttribute(searchElement.displayAttribute) || "none"}`;
    canvas.style.position = 'fixed'; // Use fixed position to stay in place on scroll
    canvas.style.border = '2px dashed #D12566';
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.zIndex = '2147483647';
    canvas.style.pointerEvents = 'none'; // Make canvas click-through

    document.body.appendChild(canvas);
    // The click listener is now on the element itself.
    htmlElt.addEventListener('click', copyToClipBoard, true);
}

function copyToClipBoard(event) {
    const targetElement = event.currentTarget as HTMLElement;
    const searchElement = JSON.parse(targetElement.getAttribute('data-tuello-search-element'));
    const title = `${searchElement.name} : ${targetElement.getAttribute(searchElement.displayAttribute) || "none"}`;

    const el = document.createElement('textarea');
    el.value = title;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    // Prevent default action and stop propagation to avoid side effects.
    event.preventDefault();
    event.stopPropagation();
}
