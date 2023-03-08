const options = {
  // background color
  bgColor: 'rgba(0,0,0,0.9)',

  // fade-in and fade-out duration
  fadeDurationMs: 400,

  // hide scroll when showing fullscreen image
  hideScroll: true,

  // fade overlay z index
  zIndex: 999
};

/**
 * ouvre une lightbox en lui donnant en entrée l'image encodée
 */
export function open(encodedImg: string) {
  const container = initContainer();
  const bodyOverflow = document.body.style.overflow;

  const image = new Image();
  image.src = encodedImg;
  image.style.maxWidth = '90%';
  image.style.maxHeight = '90%';
  image.style.margin = 'auto';
  container.appendChild(image);
  if (options.hideScroll) {
    document.body.style.overflow = 'hidden'
  }

  container.style.display = 'flex';

  window.setTimeout(() => container.style.opacity = 1, 0);

  function onClick() {
    container.removeEventListener('click', onClick);
    container.style.opacity = 0;
    window.setTimeout(() => {
      container.style.display = 'none';
      container.innerHTML = '';
      document.body.style.overflow = bodyOverflow;
      // on previent le contentscript que l'image viewer est fermé
      window.postMessage(
        {
          type: 'VIEW_IMAGE_CLOSED'
        },
        '*',
      );

    }, options.fadeDurationMs * 0.8);
  }

  container.addEventListener('click', onClick)
}

let imgboxContainer;
function initContainer() {
  if (imgboxContainer) {
    return imgboxContainer;
  }

  const o = document.createElement('div');
  o.innerHTML =
    '<div id="img_box" style="top:0px;left:0px;opacity:0;width:100%;height:100%;display:none;position:fixed;' +
    'cursor:pointer;z-index:' + options.zIndex +';background-color:' + options.bgColor +
    ';transition:opacity ' + options.fadeDurationMs + 'ms"/>';

  imgboxContainer = o.firstChild;
  document.body.appendChild(imgboxContainer);

  return imgboxContainer;
}
