import { Tag } from '../models/Tag';
import { addcss, stringContainedInURL } from './utils';
import JsonFind from 'json-find';

const HTTP_CALLS_MAX_SIZE = 100;
let httpCalls = new Map<string, any>();

/**
 * Ajoute une entrée dans httpCalls avec limite de taille (LRU simple)
 */
function addHttpCall(url: string, response: any): void {
  // Si la clé existe déjà, on la supprime pour la remettre en fin (plus récent)
  if (httpCalls.has(url)) {
    httpCalls.delete(url);
  } else if (httpCalls.size >= HTTP_CALLS_MAX_SIZE) {
    // Supprimer le premier élément (le plus ancien)
    const firstKey = httpCalls.keys().next().value;
    if (firstKey !== undefined) {
      httpCalls.delete(firstKey);
    }
  }
  httpCalls.set(url, response);
}
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
              addHttpCall(event.data.url, event.data.response);
              addTagsPanel(tuelloHTTPTags);
            }

          }
        );
        tagsUnloadListenerAdded = true;
      }
    }
  }
}

/**
 * Navigue dans un objet en suivant un chemin de clés (ex: "data.users.0.name")
 */
function getValueByPath(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function findInJson(data: any, keyString: string) {
  let result = '';

  try {
    // Nouveau format : chemin complet depuis response (ex: "response.data.id")
    if (keyString.startsWith('response.')) {
      // Retire le préfixe "response." car data est déjà la réponse
      const path = keyString.substring('response.'.length);
      result = getValueByPath(data, path);
    } else if (keyString === 'response') {
      // Si on veut la réponse entière
      result = typeof data === 'object' ? JSON.stringify(data) : data;
    } else if (keyString.includes(',') || keyString.includes(';')) {
      // Format multi-clés (ancien format compatible)
      const doc = JsonFind(data);
      keyString.split(/,|;/).forEach(elt => {
        result += result ? '\u000d' : '';
        result += elt + ' : ' + doc.findValues(elt)[elt];
      });
    } else {
      // Format simple (ancien format compatible) : recherche par nom de clé
      const doc = JsonFind(data);
      result = doc.findValues(keyString);
      result = result[keyString];
    }
  } catch (e) {
    result = data;
  }
  return result;
}

// Cache du filtre HTTP pour éviter les appels répétés à chrome.storage
let cachedHTTPFilter: string | null = null;
let filterCacheTime = 0;
const FILTER_CACHE_TTL = 5000; // 5 secondes

async function getHTTPFilterCached(): Promise<string | null> {
  const now = Date.now();
  if (now - filterCacheTime < FILTER_CACHE_TTL && cachedHTTPFilter !== undefined) {
    return cachedHTTPFilter;
  }
  const items = await chrome.storage.local.get(['tuelloHTTPFilter']);
  cachedHTTPFilter = items['tuelloHTTPFilter'] || null;
  filterCacheTime = now;
  return cachedHTTPFilter;
}

async function getResponseByPartialUrl(map: Map<string, any>, partialKey: Tag): Promise<any | null> {
  const httpFilter = await getHTTPFilterCached();
  for (const [key, value] of map.entries()) {
    // on ne traite que celles qui ne sont pas filtrée ou si le filtre est vide
    if (!httpFilter || stringContainedInURL(httpFilter, key)) {
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