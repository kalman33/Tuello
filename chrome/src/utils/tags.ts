import { Tag } from '../models/Tag';
import { addcss } from './utils';
import JsonFind from 'json-find';

let httpCalls = new Map<string, any>();

export function initTagsHandler() {
  chrome.storage.local.get(['tuelloHTTPTags'], results => {
    if (results['tuelloHTTPTags']) {
      // on active l'intercepteur HTTP
      (window as any).XMLHttpRequest.prototype.send = recorderHttpForTags.sendXHR;
      window.fetch = recorderHttpForTags.recordFetch;
    }
    // on ecoute les postMessage si on est en fenetre mère
    if (window.top === window) {
      window.addEventListener(
        'message',
        event => {
          if (event?.data?.type && event?.data?.type === 'ADD_HTTP_CALL_FOR_TAGS') {
            httpCalls.set(event.data.url, event.data.response);
            displayTags(results['tuelloHTTPTags']);
          }

        }
      );
    }
  });
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

function getResponseByPartialUrl(map, partialKey) {
  for (let [key, value] of map.entries()) {
    if (key.includes(partialKey)) {
      return value;
    }
  }
  return null; // Aucune correspondance trouvée
}

/**
 * ajoute le panel tag dans la page
 */
export function addTagsPanel(tags: Tag[]) {
  let display = false;

  for (const tag of tags) {
    tag.jsonKeyValue = findTagInHttpCalls(tag);
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
    element.remove();
  });
}

function findTagInHttpCalls(tag: Tag) {
  let ret;
  const data = getResponseByPartialUrl(httpCalls, tag);
  if (data) {
    ret = findInJson(data, tag.jsonKey);
  }
  return ret;
}

function displayTags(tags: Tag[]) {
  deleteTagsPanel();
  addcss(chrome.runtime.getURL('tags.css'));

  //TAG
  const tagDiv = document.createElement('div');
  tagDiv.id = "tuelloTags"
  tagDiv.className = "tuello-tag";

  // FRONT
  const frontDiv = document.createElement('div');
  frontDiv.className = "tuello-front";
  tagDiv.appendChild(frontDiv);

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
    }
  }
  frontDiv.appendChild(contentDiv);
  tagDiv.appendChild(frontDiv);
  document.body.appendChild(tagDiv);
}

let recorderHttpForTags = {
  originalSendXHR: window.XMLHttpRequest.prototype.send,

  sendXHR: function () {
    const self = this;
    const realOnReadyStateChange = self.onreadystatechange;

    self.onreadystatechange = function () {
      // Vérifie si la requête est terminée (readyState === 4)
      if (self.readyState === 4) {
        httpCalls.set(self.responseURL, self.responseText);
        if (window.top === window) {
          httpCalls.set(self.responseURL, self.responseText);
        } else {
          window.top.postMessage({
            type: 'ADD_HTTP_CALL_FOR_TAGS',
            url: self.responseURL,
            response: self.responseText
          }, '*');
        }
      }
      if (realOnReadyStateChange) {
        realOnReadyStateChange.apply(self, arguments);
      }
    };

    // Appel de la fonction send d'origine
    return recorderHttpForTags.originalSendXHR.apply(this, arguments);
  },

  originalFetch: window.fetch.bind(window),
  recordFetch: async (...args: any[]) => {

    //const response = await recorderHttp.originalFetch(...args);
    const response = await recorderHttp.originalFetch.apply(null, args as Parameters<typeof fetch>);
    let data: any;
    if (args[0] && typeof args[0] === 'string') {
      data =
      {
        url: args[0],
      };

      /* work with the cloned response in a separate promise
         chain -- could use the same chain with `await`. */
      response
        .clone()
        .json()
        .then(body => data = {
          ...data,
          response: body
        })
        .catch(err => data = {
          ...data,
          response: err
        })
        .finally(() => {
          if (window.top === window) {
            httpCalls.set(data.url, data.response);
          } else {
            data.type = 'ADD_HTTP_CALL_FOR_TAGS';
            const obj = JSON.parse(JSON.stringify(data));
            window.top.postMessage(obj, '*');
          }
        });

    }
    /* the original response can be resolved unmodified: */
    return response;
  }
};