import { HTML_TAGS } from "../constantes/htmlTags.constantes";
import { SearchElement } from "../models/SearchElement";
// import { addcss } from "./utils";

let elementsFound = new Map<HTMLElement, string>();
let resizeObserver; 
// let mutationObserver;

export function activateSearchElements() {
  //addcss(chrome.runtime.getURL('simptip.min.css'));
  searchElements();

  // on active le listener pour le click souris
  // document.addEventListener('click', searchElements);
  window.addEventListener("resize", searchElements);
}

export function desactivateSearchElements() {
  removeSearchElements();
  // document.removeEventListener('click', searchElements);
  window.removeEventListener('resize', searchElements);
  
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
 /* if (mutationObserver) {
    mutationObserver.disconnect();
  }*/
}

function searchElements() {
  //on supprime en premier tous les anciens canvas
  removeSearchElements();
  // recupération des elements
  chrome.storage.local.get(['tuelloElements'], results => {
    let elements = results['tuelloElements'];
    if (elements) {
      elements.forEach(element => {
        const nodes = findElement(element.name);
        nodes.forEach((node: Node, index: number) => {
          const htmlElt = (node as HTMLElement);
          //elementsFound.set(htmlElt, htmlElt.style.backgroundColor);
          //htmlElt.style.backgroundColor = 'rgba(209, 37, 102)';
          createCanvas(element, htmlElt, index);
          observeElement(element, htmlElt, index);
        });
      });
    }
  });
}

function removeSearchElements() {
  const elements = document.querySelectorAll('[id^="tuelloSearchElement"]');
  elements.forEach((element) => {
    element.remove();
  });
}

export function findElement(element: string): Node[] {
  if (element.includes('<') || HTML_TAGS.find(e => e === element)) {
    return Array.from(document.querySelectorAll(element.replace('<', '').replace('>', '')));
  } else {
    const elts = document.querySelectorAll('[' + element + ']');
    if (elts && elts.length > 0) {
      return Array.from(elts);
    } else {
      return findByText(document.body, element);
    }
  }
}

/** recherche des nodes contenant le texte */
export function findByText(rootElement, text): Node[] {
  var filter = {
    acceptNode: function (node) {
      // look for nodes that are text_nodes and include the following string.
      if (node.nodeType === document.TEXT_NODE && node.nodeValue.includes(text)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  }
  var nodes = [];
  var walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, filter);
  while (walker.nextNode()) {
    //give me the element containing the node
    nodes.push(walker.currentNode.parentNode);
  }
  return nodes;
}

function observeElement(searchElement: SearchElement, htmlElt: HTMLElement, index: number) {
  resizeObserver = new ResizeObserver((entries, observer) => {
    console.log(' INITIAL RESIZE', entries);
    entries.map((entry) => {
        console.log('RESIZE', entry.target);
        let canvas = document.getElementById(`tuelloSearchElement${index}`);
        if (canvas) {
          canvas.remove();
        }
        createCanvas(searchElement, entry.target, index);
    });
  });
  
  resizeObserver.observe(htmlElt);
  
  /*var mutationOptions = { attributes: true, childList: true, subtree: true };

  mutationObserver = new MutationObserver((mutationsList, observer) => {
    for(let mutation of mutationsList){
      console.log("MUTATION", mutation.target);
    }
    //callback();
  });
  mutationObserver.observe(htmlElt, mutationOptions);
*/
}

function createCanvas(searchElement: SearchElement, htmlElt: Element, index: number) {
  const canvas = document.createElement('canvas');
  canvas.id = "tuelloSearchElement" + index;
  //Position canvas
  canvas.title = searchElement.name + " : " + (htmlElt.getAttribute(searchElement.displayAttribute) || "none");
  canvas.style.position = 'absolute';
  canvas.style.border = '2px dashed #D12566';
  canvas.style.left = Math.ceil(htmlElt.getBoundingClientRect().left + window.scrollX) - 2 + 'px';
  canvas.style.top = Math.ceil(htmlElt.getBoundingClientRect().top + window.scrollY) - 2 + 'px';
  canvas.width = htmlElt.getBoundingClientRect().width + 2;
  canvas.height = htmlElt.getBoundingClientRect().height + 2;
  canvas.style.zIndex = (htmlElt as HTMLElement).style.zIndex;
  /*if (!htmlElt.classList.contains('simptip-position-top')) {
    htmlElt.classList.add('simptip-fade');
    htmlElt.classList.add('simptip-position-top');
    htmlElt.setAttribute('data-tooltip', searchElement);
  }*/
  document.body.appendChild(canvas); //Append canvas to body element
  canvas.addEventListener('click', copyToClipBoard);
 
}

/**
 * Copie le titre de l'élement clické dans le presse-papiers
 * @param text 
 */
function copyToClipBoard(event) {
  var targetElement = event.target || event.srcElement;
  window.navigator['clipboard'].writeText(targetElement.title);
}
