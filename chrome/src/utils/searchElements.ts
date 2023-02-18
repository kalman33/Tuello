export function activateSearchElements() {
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
  removeSearchElements() ;
  // recupération des elements
  chrome.storage.local.get(['tuelloElements'], results => {
    let elements = results['tuelloElements'];

      elements.forEach(element => {
          const nodes = findElement(element);
          nodes.forEach((node: Node, index: number) => { 
            const canvas = document.createElement('canvas');
            canvas.id = "tuelloSearchElement" + index;
            //Position canvas
            canvas.title = element;
            canvas.style.position = 'absolute';
            canvas.style.border= '2px solid #D12566';
            canvas.style.left = Math.ceil((node as HTMLElement).getBoundingClientRect().left + window.scrollX) - 2 + 'px';
            canvas.style.top = Math.ceil((node as HTMLElement).getBoundingClientRect().top + window.scrollY) - 2 + 'px';
            canvas.width = (node as HTMLElement).getBoundingClientRect().width + 2;
            canvas.height = (node as HTMLElement).getBoundingClientRect().height + 2;
            canvas.style.zIndex = '999999999';

            document.body.appendChild(canvas); //Append canvas to body element
          });

      });
  });
}

function removeSearchElements() {
  const elements = document.querySelectorAll('[id^="tuelloSearchElement"]');
  elements.forEach((element) => {
    element.remove();
  });
}

export function findElement(element: string): Node[] {
  if (element.includes('<')) {
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
export function findByText(rootElement, text): Node[]{
  var filter = {
      acceptNode: function(node){
          // look for nodes that are text_nodes and include the following string.
          if(node.nodeType === document.TEXT_NODE && node.nodeValue.includes(text)){
               return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
      }
  }
  var nodes = [];
  var walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, filter);
  while(walker.nextNode()){
     //give me the element containing the node
     nodes.push(walker.currentNode.parentNode);
  }
  return nodes;
}

