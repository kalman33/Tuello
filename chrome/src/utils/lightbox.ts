const options = {
  // background color
  bgColor: 'rgba(0,0,0,0.4)',

  // fade-in and fade-out duration
  fadeDurationMs: 400,

  // hide scroll when showing fullscreen image
  hideScroll: true,

  // fade overlay z index
  zIndex: 999
};

/**
 * Interface presenting the configurable properties of the application
 */
export interface LightboxParams {
  content: HTMLElement | string;
  autocCloseMs?: number;
}

let container;
let resolveEx;
let rejectEx;
let bodyOverflow;

/**
 * ouvre une lightbox en lui donnant en entrée l'image encodée
 */
export function open(params: LightboxParams) {
  return new Promise((resolve, reject) => {
    resolveEx = resolve;
    rejectEx = reject;
    container = initContainer();
    bodyOverflow = document.body.style.overflow;

    const divElt = document.createElement('div');
    divElt.style.maxWidth = '90%';
    divElt.style.maxHeight = '90%';
    divElt.style.margin = 'auto';
    divElt.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    divElt.style.textTransform = 'uppercase';
    divElt.style.padding = '10px';
    divElt.style.fontSize = '24px';
    divElt.style.fontWeight = 'bolder';
    divElt.style.letterSpacing = '0.4em';
    divElt.style.fontFamily = 'system-ui';
    divElt.style.color = 'white';
    if (params.content instanceof HTMLElement) {
      divElt.appendChild(params.content);
    } else {
      divElt.append(params.content);
    }
   
    container.appendChild(divElt);
    if (options.hideScroll) {
      document.body.style.overflow = 'hidden';
    }

    container.style.display = 'flex';

    window.setTimeout(() => (container.style.opacity = 1), 0);

    if (params && params.autocCloseMs) {
      window.setTimeout(() => {
        container.style.display = 'none';
        container.innerHTML = '';
        document.body.style.overflow = bodyOverflow;
        return resolve(null);
      }, params.autocCloseMs);
    }
  });
}

export function close(){
  const commentValue = document.forms['comment']['inputComment'].value;
  container.style.display = 'none';
  container.innerHTML = '';
  document.body.style.overflow = bodyOverflow;
  return resolveEx(commentValue);
}

let imgboxContainer;
function initContainer() {
  if (imgboxContainer) {
    return imgboxContainer;
  }

  const o = document.createElement('div');
  o.innerHTML =
    '<div id="lightbox" style="top:0px;left:0px;opacity:0;width:100%;height:100%;display:none;position:fixed;' +
    'cursor:pointer;z-index:' +
    options.zIndex +
    ';background-color:' +
    options.bgColor +
    ';transition:opacity ' +
    options.fadeDurationMs +
    'ms"/>';

  imgboxContainer = o.firstChild;
  document.body.appendChild(imgboxContainer);

  return imgboxContainer;
}

export function addcss(cssUrl: string) {
  const cssId = cssUrl.substring(cssUrl.lastIndexOf('/') + 1);
  if (!document.getElementById(cssId)) {
    var head = document.getElementsByTagName('head')[0];
    var link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = cssUrl;
    link.media = 'all';
    head.appendChild(link);
  }
}

