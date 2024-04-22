import { Tag } from '../models/Tag';
import { addcss, stringContainedInURL } from './utils';
import JsonFind from 'json-find';

let httpCalls = new Map<string, any>();
let lastExecutionTimer;
let tagsUnloadListenerAdded = false;
let tagsListenerAdded = false;


export function initTagsHandler(tuelloHTTPTags) {
  if (tuelloHTTPTags && tuelloHTTPTags.length > 0) {
    window.postMessage(
      {
        type: 'RECORD_HTTP_CALL_FOR_TAGS',
        value: true
      },
      '*'
    );
    if (!tagsUnloadListenerAdded) {
      window.addEventListener('beforeunload', (event) => {
        httpCalls = new Map<string, any>();
        for (const tag of tuelloHTTPTags) {
          tag.jsonKeyValue = null;
        }
      });
      tagsUnloadListenerAdded = true;
    }
   
    if (!tagsListenerAdded) {

    }
    // on ecoute les postMessage si on est en fenetre mère
    if (!tagsListenerAdded) {
      if (window.top === window) {
        window.addEventListener(
          'message',
          event => {
            if (event?.data?.type === 'ADD_HTTP_CALL_FOR_TAGS') {
              httpCalls.set(event.data.url, event.data.response);
              addTagsPanel(tuelloHTTPTags);
            }
  
          }
        );
        tagsUnloadListenerAdded = true;
      }
    }
  }
}

function findInJson(data: any, keyString: string) {
  let result = '';
  const doc = JsonFind(data);
  try {
    if (keyString.includes(',') || keyString.includes(';')) {
      keyString.split(/,|;/).forEach(elt => {
        result += result ? '\u000d' : '';
        result += elt + ' : ' + doc.findValues(elt)[elt];
      });
    } else {
      result = doc.findValues(keyString);
      result = result[keyString];
    }
  } catch (e) {
    result = data;
  }
  return result;

}

async function getResponseByPartialUrl(map, partialKey) {
  const items = await chrome.storage.local.get(['tuelloHTTPFilter']);
  for (let [key, value] of map.entries()) {
    // on ne traite que celles qui ne sont pas filtrée ou si le filtre est vide
    if (!items['tuelloHTTPFilter'] || (items['tuelloHTTPFilter'] && stringContainedInURL(items['tuelloHTTPFilter'], key))) {
      if (key.includes(partialKey?.httpKey)) {
        return value;
      }
    }
  }
  return null; // Aucune correspondance trouvée
}

/**
 * ajoute le panel tag dans la page
 */
export async function addTagsPanel(tags: Tag[]) {
  let display = false;
  for (const tag of tags) {
    // le jsonKeyValue n'a pas été déjà calculée sur cette url
    if (!tag.jsonKeyValue) {
      tag.jsonKeyValue = await findTagInHttpCalls(tag);
      const tagLocation = new URL(document.location.href);
      tagLocation.search = '';
      tag.location = tagLocation.toString();
    }
    if (tag.jsonKeyValue) {
      display = true;
    }
  }
  if (display) {
    displayTags(tags);
  }
}

export function deleteTagsPanel() {
  const elements = document.querySelectorAll('#tuelloTags');
  elements.forEach((element) => {
    element.removeEventListener('click', toggleTagPosition);
    element.remove();
  });
}

async function findTagInHttpCalls(tag: Tag) {
  let ret;
  const data = await getResponseByPartialUrl(httpCalls, tag);
  if (data) {
    ret = findInJson(data, tag.jsonKey);
  }
  return ret;
}

async function displayTags(tags: Tag[]) {

  // Annuler la dernière exécution en attente
  clearTimeout(lastExecutionTimer);
  // Définir une nouvelle exécution à déclencher dans 300 ms
  lastExecutionTimer = setTimeout(async () => {

    let display = false;

    // CONTENT
    const contentDiv = document.createElement('div');
    contentDiv.className = "tuello-content";

    // DATAs
    let content;
    for (const tag of tags) {
      if (tag.jsonKeyValue) {
        content = document.createElement('div');
        content.innerHTML = `${tag.display}:  ${tag.jsonKeyValue}`;
        contentDiv.appendChild(content);
        display = true;
      }
    }
    if (display) {
      addcss(chrome.runtime.getURL('tags.css'));
      const storageData = await (chrome.storage.local.get(['tuelloTagsPosition']));
      const position = storageData['tuelloTagsPosition'] || 'right';
      deleteTagsPanel();

      //TAG
      const tagDiv = document.createElement('div');
      tagDiv.id = "tuelloTags"
      tagDiv.className = "tuello-tag " + position;
      tagDiv.addEventListener('click', toggleTagPosition);

      // FRONT
      const frontDiv = document.createElement('div');
      frontDiv.className = "tuello-front";

      tagDiv.appendChild(frontDiv);
      frontDiv.appendChild(contentDiv);
      tagDiv.appendChild(frontDiv);
      document.body.appendChild(tagDiv);
    }
  }, 300); // 300 ms de délai
}

// Définir la fonction du clic de l'événement
async function toggleTagPosition(event) {

  const tagDiv = event.currentTarget;
  let rightState = tagDiv.classList.contains('right');
  if (rightState) {
    tagDiv.classList.remove('right');
    tagDiv.classList.add('left');
    await chrome.storage.local.set({ 'tuelloTagsPosition': 'left' });
  } else {
    tagDiv.classList.remove('left');
    tagDiv.classList.add('right');
    await chrome.storage.local.set({ 'tuelloTagsPosition': 'right' });
  }
}