import { HTML_TAGS } from "../constantes/htmlTags.constantes";
import { addcss } from "./utils";

let elementsFound = new Map<HTMLElement, string>();

export function activateSearchElements() {
  addcss(chrome.runtime.getURL('simptip.min.css'));
  searchElements();

  // on active le listener pour le click souris
  document.addEventListener('click', searchElements);

}

export function desactivateSearchElements() {
  removeSearchElements();
  document.removeEventListener('click', searchElements);
}

function searchElements() {
  //on supprime en premier tous les anciens canvas
  removeSearchElements();
  // recupération des elements
  chrome.storage.local.get(['tuelloElements'], results => {
    let elements = results['tuelloElements'];
    if (elements){
      elements.forEach(element => {
        const nodes = findElement(element);
        nodes.forEach((node: Node, index: number) => {
          const htmlElt = (node as HTMLElement);
          elementsFound.set(htmlElt, htmlElt.style.backgroundColor);
          htmlElt.style.backgroundColor = 'rgba(209, 37, 102)';
          if (!htmlElt.classList.contains('simptip-position-top')) {
            htmlElt.classList.add('simptip-fade');
            htmlElt.classList.add('simptip-position-top');
            htmlElt.setAttribute('data-tooltip', element);
          }
        });
      });
    }
  });
}

function removeSearchElements() {
  // const elements = document.querySelectorAll('[id^="tuelloSearchElement"]');
  elementsFound.forEach((value, key) => {
    //element.style.backgroundColor
    key.style.backgroundColor = value;
    key.classList.remove('simptip-fade');
    key.classList.remove('simptip-position-top');
    key.removeAttribute('data-tooltip');

  });
}

export function findElement(element: string): Node[] {
  if (element.includes('<') || HTML_TAGS.find(e => e === element))  {
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

