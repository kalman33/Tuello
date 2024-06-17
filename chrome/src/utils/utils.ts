import { ICoordinates } from '../models/UserAction';


/**
 * permet de supprimer les doublons dans le flux json
 */
export function removeDuplicateEntries(data: any): any {
  // suppression doublons dans json
  const temp = [];
  return data.filter(item => {
    if (!temp.includes(item.key)) {
      temp.push(item.key);
      return true;
    } else {
      return false;
    }
  });
}

export function removeDuplicatesKeepLast(data) {
  const temp = {};
  data.forEach(item => {
    temp[item.key] = item; // Remplace chaque élément avec la même clé dans temp
  });

  // Retourne les valeurs de temp, qui contiendront uniquement le dernier élément de chaque clé
  return Object.values(temp);
}

export function stringContainedInURL(stringData, url) {
  // Vérifier si la chaîne est définie et si elle est une chaîne de caractères
  if (typeof stringData !== 'string') {
    return true;
  }
  // Échapper les caractères spéciaux dans la chaîne de caractères pour éviter les problèmes avec les expressions régulières
  const escapedString = stringData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Remplacer les astérisques (*) par des expressions régulières correspondant à n'importe quel caractère (.*)
  const regexString = escapedString.replace(/\\\*/g, '.*');
  // Créer une expression régulière à partir de la chaîne
  const regex = new RegExp(regexString);
  // Vérifier si la chaîne est contenue dans l'URL en utilisant l'expression régulière
  return regex.test(url);
}



export function crop(canvas, cropX, cropY, cropWidth, cropHeight) {
  // create a temporary canvas sized to the cropped size
  var canvas1 = document.createElement('canvas');
  var ctx = canvas1.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas1.width = cropWidth;
  canvas1.height = cropHeight;
  // use the extended from of drawImage to draw the
  // cropped area to the temp canvas
  ctx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  var ret = JSON.parse(JSON.stringify(canvas1.toDataURL()));
  // Removes an element from the document
  ctx.clearRect(0, 0, cropWidth, cropHeight);
  // return the .toDataURL of the temp canvas
  return (ret);
}

export function getOffset(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

export function iframeURLChange(iframe, callback) {
  const unloadHandler = () => {
    // Timeout needed because the URL changes immediately after
    // the `unload` event is dispatched.
    setTimeout(() => {
      callback(iframe.contentWindow.location.href);
    }, 0);
  };

  function attachUnload() {
    // Remove the unloadHandler in case it was already attached.
    // Otherwise, the change will be dispatched twice.
    iframe.contentWindow.removeEventListener('unload', unloadHandler, true);
    iframe.contentWindow.addEventListener('unload', unloadHandler, true);
  }

  iframe.addEventListener('load', attachUnload, true);
  attachUnload();
}





/**
 * permet de rajouter une fonction sur le onload d'un element
 */
export function addLoadEvent(elt, func) {
  const oldonload = elt.onload;
  if (typeof elt.onload !== 'function') {
    elt.onload = func;
  } else {
    elt.onload = () => {
      if (oldonload) {
        oldonload();
      }
      func();
    };
  }
}

/** Permet de ne rajouter qu'une seule fois un listener
 *
 * @param type : type de l'event listener
 * @param func fonction à exécuter
 */
export function addEventListener(type, func) {
  window.removeEventListener(type, func);
  window.addEventListener(type, func);
}

/**
 * crée un halo autour des coordonnées x, y
 * @param x
 * @param y
 */
export function displayEffect(x, y) {
  return new Promise(resolve => {
    let div = document.createElement('div');
    div.style.left = (x - window.scrollX) + 'px';
    div.style.top = (y - window.scrollY) + 'px';
    div.className = 'tuello-circle';
    document.body.append(div);

    setTimeout(() => {
      document.body.removeChild(div);
      resolve(true);
    }, 500);
  });
}

/**
 * 
 * @param tagName recherche un element html à partir de sont type (a, button, ect...) et d'une coordonnée
 * @param x 
 * @param y 
 */
export function getHTMLElement(tagName: string, x: number, y: number): HTMLElement {

  // recherche des a href
  const elt = Array.from(document.getElementsByTagName(tagName)).find(item => {
    const rect = item.getBoundingClientRect();
    if ((rect.left + window.scrollX < x && x < rect.left + window.scrollX + rect.width) &&
      (rect.top + window.scrollY < y && y < rect.top + window.scrollY + rect.height)) {
      return true;
    } else {
      return false;
    }
  });

  return elt ? (elt as HTMLElement) : undefined;
}

/**
 * Get parent node for given tagname
 * @param  {Object} node    DOM node
 * @param  {String} tagname HTML tagName
 * @return {Object}         Parent node
 */
export function getParentByTagName(node: HTMLElement, tagname: string) {
  var parent;
  if (node === null || tagname === '') return;
  parent = node.parentNode;
  tagname = tagname.toUpperCase();

  while (parent?.tagName !== "HTML") {
    if (parent?.tagName.toLowerCase() === tagname.toLowerCase()) {
      return parent;
    }
    parent = parent.parentNode;
  }

  return parent;
}

/**Permet de savoir si un élément est visible ou pas
 * e provient de getXPath
 */
export function isVisible(e: string) {
  const elt = getElementFromXPath(e)
  return !!(elt && (elt.offsetWidth || elt.offsetHeight || elt.getClientRects().length));
}


/**
 * 
 * @param el Permet de récuperer une clef qui permettra de retrouver l'element via un querySelector
 * @returns 
 */
export function getCSSPath(el) {
  if (!(el instanceof Element))
    return null;
  var path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    var selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += '#' + el.id;
      path.unshift(selector);
      break;
    } else {
      var sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector)
          nth++;
      }
      if (nth != 1)
        selector += ":nth-of-type(" + nth + ")";
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

/** Permet de savoir si le click est dans l'élement */
export function clickInside(coord: ICoordinates, x: number, y: number): boolean {
  if (coord) {
    return coord.top <= y && y <= (coord.top + coord.height) && coord.left <= x && x <= (coord.left + coord.width)
  } else {
    return false;
  }
}



/**
 * Get absolute xPath position from dom element
 * xPath position will does not contain any id, class or attribute, etc selector
 * Because, Some page use random id and class. This function should ignore that kind problem, so we're not using any selector
 * 
 * @param {Element} element element to get position
 * @returns {String} xPath string
 */
export function getXPath(element) {
  // Selector
  let selector = '';
  // Loop handler
  let foundRoot;
  // Element handler

  let currentElement = element;
  let tagName;
  let parentElement;

  // Do action until we reach html element
  do {
    // Get element tag name 
    tagName = currentElement?.tagName?.toLowerCase();
    // Get parent element
    parentElement = currentElement?.parentElement;

    // Count children
    if (parentElement?.childElementCount > 1) {
      // Get children of parent element
      const parentsChildren = [...parentElement.children];
      // Count current tag 
      let tag = [];
      parentsChildren.filter(elt => !elt.id || !elt.id.includes('tuello')).forEach(child => {
        if (child.tagName.toLowerCase() === tagName) tag.push(child) // Append to tag
      })

      // Is only of type
      if (tag.length === 1) {
        // Append tag to selector
        selector = `/${tagName}${selector}`;
      } else {
        // Get position of current element in tag
        const position = tag.indexOf(currentElement) + 1;
        // Append tag to selector
        selector = `/${tagName}[${position}]${selector}`;
      }

    } else {
      //* Current element has no siblings
      // Append tag to selector
      selector = `/${tagName}${selector}`;
    }

    // Set parent element to current element
    currentElement = parentElement;
    // Is root  
    foundRoot = parentElement?.tagName?.toLowerCase() === 'html';
    // Finish selector if found root element
    if (foundRoot) selector = `/html${selector}`;
  }
  while (foundRoot === false && tagName && parentElement);
  // Return selector
  return selector;
}

export function getElementFromXPath(xpath: string): HTMLElement {
  return (document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement);
}

/** Permet de savoir si un element est positionné dans un elément fixé */
export function isFixedPosition(node) {
  while (node && node.nodeName.toLowerCase() !== 'body') {
    if (window.getComputedStyle(node).getPropertyValue('position').toLowerCase() === 'fixed') { return true; }
    node = node.parentNode;
  }
  return false; // if got this far
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

export function isJSON(text) {
  if (typeof text !== "string") {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch (error) {
    return false;
  }
}

export function removeURLPort(url: string) {
  let ret = '';
  try {
    let parseURL = new URL(url);
    parseURL.port = '';
    ret = parseURL.toString();
  } catch (e) {
    ret = url;
  }
  return ret;
}

export function removeURLPortAndQueryString(url: string) {
  let ret = '';
  try {
    let parseURL = new URL(url);
    parseURL.port = '';
    parseURL.search = '';
    ret = parseURL.toString();
  } catch (e) {
    ret = url;
  }
  return ret;
}

/**
 * permet de parser le body envoyé dans une requete
 * @param data 
 * @returns 
 */
export function getBodyFromData(data: any) {
  let result = {};
  try {

    if (data) {
      if (data instanceof ArrayBuffer) {

        result = JSON.parse(new TextDecoder().decode((data) as ArrayBuffer));
        //result = JSON.parse(atob(decodeURIComponent(result['body'])))

      }
      else if (data instanceof FormData) {
        let object = {};
        data.forEach((value, key) => object[key] = value);
        result = JSON.stringify(object);
      }
      else if (data instanceof URLSearchParams) {
        let object = {};
        data.forEach(function (value, key) {
          object[key] = value;
        });
        result = JSON.stringify(object);
      }
      else if (typeof data === 'string') {
        //ok
        if (isJSON(data)) {
          result = data;
        } else {
          result = JSON.parse(data);
        }
      } else {
        result = data;
      }
    }
  } catch (e) {
    result = {};
  }
  return result;
}

// donne le keycode clavier à partir de la key
export function getKeyCode(key) {
  const keyMap = {
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'Enter': 'Enter',
      'Shift': 'ShiftLeft',
      'Control': 'ControlLeft',
      'Alt': 'AltLeft',
      'CapsLock': 'CapsLock',
      'Escape': 'Escape',
      'Space': 'Space',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'End': 'End',
      'Home': 'Home',
      'ArrowLeft': 'ArrowLeft',
      'ArrowUp': 'ArrowUp',
      'ArrowRight': 'ArrowRight',
      'ArrowDown': 'ArrowDown',
      'Insert': 'Insert',
      'Delete': 'Delete',
      '0': 'Digit0',
      '1': 'Digit1',
      '2': 'Digit2',
      '3': 'Digit3',
      '4': 'Digit4',
      '5': 'Digit5',
      '6': 'Digit6',
      '7': 'Digit7',
      '8': 'Digit8',
      '9': 'Digit9',
      'A': 'KeyA',
      'B': 'KeyB',
      'C': 'KeyC',
      'D': 'KeyD',
      'E': 'KeyE',
      'F': 'KeyF',
      'G': 'KeyG',
      'H': 'KeyH',
      'I': 'KeyI',
      'J': 'KeyJ',
      'K': 'KeyK',
      'L': 'KeyL',
      'M': 'KeyM',
      'N': 'KeyN',
      'O': 'KeyO',
      'P': 'KeyP',
      'Q': 'KeyQ',
      'R': 'KeyR',
      'S': 'KeyS',
      'T': 'KeyT',
      'U': 'KeyU',
      'V': 'KeyV',
      'W': 'KeyW',
      'X': 'KeyX',
      'Y': 'KeyY',
      'Z': 'KeyZ',
      ';': 'Semicolon',
      '=': 'Equal',
      ',': 'Comma',
      '-': 'Minus',
      '.': 'Period',
      '/': 'Slash',
      '`': 'Backquote',
      '[': 'BracketLeft',
      '\\': 'Backslash',
      ']': 'BracketRight',
      '\'': 'Quote'
  };

  // Retourner le code correspondant si la touche existe dans la table
  return keyMap[key] || null;
}
