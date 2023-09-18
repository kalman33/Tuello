import JSONEditor from 'jsoneditor';
import { addcss } from './utils';
// Json Editor
let jsonEditorTree: any;
let opts: any;


const options = {
  // background color
  bgColor: 'rgba(0,0,0,0.4)',

  // fade-in and fade-out duration
  fadeDurationMs: 400,

  // fade overlay z index
  zIndex: '999'
};



let container;
let resolveEx;
let rejectEx;
let bodyOverflow;
let viewerDisplay = false;

/**
 * ouvre une lightbox en lui donnant en entrée l'image encodée
 */
export function open(json: string) {
  return new Promise((resolve, reject) => {
    resolveEx = resolve;
    rejectEx = reject;
    container = initContainer();
    bodyOverflow = document.body.style.overflow;

    //CLOSE BUTTON
    const buttonElt = document.createElement('button');
    buttonElt.style.position = 'absolute';
    buttonElt.style.right = '1%'; 
    buttonElt.style.top = '1%';
    buttonElt.style.height = '32px';
    buttonElt.style.margin = '20px';
    buttonElt.style.zIndex = options.zIndex;
    buttonElt.style.backgroundColor = '#4e4444';
    buttonElt.setAttribute('class', 'closeLightbox');
    buttonElt.onclick = close;
    container.appendChild(buttonElt);


    // VIEWER
    const divElt = document.createElement('div');
    divElt.style.position = 'absolute';
    divElt.style.top = '1%';
    divElt.style.left = '1%';
    divElt.style.bottom = '1%';
    divElt.style.right = '1%';
    divElt.style.overflowY = 'scroll';
    divElt.style.border = '1px solid #OOO';
    divElt.style.padding = '20px';
    divElt.style.marginTop = '32px';
    divElt.setAttribute('id', 'jsonEditorTree');
  
    container.appendChild(divElt);

    //Json editor
    initJsonEditor(json);

  });
}

export function close() {
  container.style.display = 'none';
  container.innerHTML = '';
  document.body.style.overflow = bodyOverflow;
  return resolveEx();
}

let jsonBoxContainer;
function initContainer() {
  if (jsonBoxContainer) {
    return jsonBoxContainer;
  }

  const o = document.createElement('div');
  o.innerHTML =
    '<div id="jsonViewerLightbox" style="top:0;left:0;bottom:0;right:0;display:none;position:fixed;' +
    'cursor:pointer;z-index:' +
    options.zIndex +
    ';background-color:' +
    options.bgColor +
    ';transition:opacity ' +
    options.fadeDurationMs +
    'ms"/>';

  jsonBoxContainer = o.firstChild;
  document.body.appendChild(jsonBoxContainer);

  return jsonBoxContainer;
}



/**
   * initialisation du jsoneditor
   */
function initJsonEditor(json: string) {

  chrome.storage.local.get(['messages'], results => {
    let language;

    if (results.messages) {
      const msgs = results.messages.default;
      language = msgs['mmn.jsoneditor.language'] || 'en';
    }


    // options du jsoneditor
    opts = {

      mode: 'view',
      enableTransform: false,
      language: language || 'en',
      enableSort: false

    };

    // init du jsoneditor
    jsonEditorTree = new JSONEditor(document.getElementById('jsonEditorTree'), opts);

    try {
      jsonEditorTree.setText(JSON.stringify(json));
      jsonEditorTree.expandAll();
      addcss(chrome.runtime.getURL('jsoneditor-default.css'));
      addcss(chrome.runtime.getURL('jsoneditor.css'));
      document.getElementById('jsonViewerLightbox').style.display = 'flex';
      window.setTimeout(() => document.getElementById('jsonViewerLightbox').style.opacity = '1', 0);
    } catch (e) {
      jsonEditorTree.setText('{}');
      document.getElementById('jsonViewerLightbox').remove();
    }
  });


}

