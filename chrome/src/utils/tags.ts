import { Tag } from '../models/Tag';
import { addcss } from './utils';
import JsonFind from 'json-find';

let httpCalls = new Map<string, any>();
let rightState = true; 


export function initTagsHandler(tuelloHTTPTags) {
  
  window.postMessage(
    {
      type: 'RECORD_HTTP_CALL_FOR_TAGS',
      value: true
    },
    '*'
  );

  window.addEventListener('beforeunload', (event) => {
    httpCalls = new Map<string, any>();
    for (const tag of tuelloHTTPTags) {
      tag.jsonKeyValue = null;
    }
});

  // on ecoute les postMessage si on est en fenetre mère
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

function getResponseByPartialUrl(map, partialKey) {
  for (let [key, value] of map.entries()) {
    if (key.includes(partialKey?.httpKey)) {
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
    // le jsonKeyValue n'a pas été déjà calculée sur cette url
    if (!tag.jsonKeyValue) {
      tag.jsonKeyValue = findTagInHttpCalls(tag);
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
  if (display){
    deleteTagsPanel();
    addcss(chrome.runtime.getURL('tags.css'));

    //TAG
    const tagDiv = document.createElement('div');
    tagDiv.id = "tuelloTags"
    tagDiv.className = "tuello-tag right";
    tagDiv.addEventListener('click', () => {
      if (rightState) {
        tagDiv.classList.remove('right');
        tagDiv.classList.add('left');
      } else {
        tagDiv.classList.remove('left');
        tagDiv.classList.add('right');
      }
      rightState = !rightState;
      
    });

    // FRONT
    const frontDiv = document.createElement('div');
    frontDiv.className = "tuello-front";
   


    tagDiv.appendChild(frontDiv);
    frontDiv.appendChild(contentDiv);
    tagDiv.appendChild(frontDiv);
    document.body.appendChild(tagDiv);
  }
}

