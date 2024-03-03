import { Tag } from '../models/Tag';
import { addcss } from './utils';
import JsonFind from 'json-find';


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

function removeURLPortAndProtocol(url: string) {
  let ret = '';
  try {
    let parseURL = new URL(url);
    parseURL.port = '';
    ret = parseURL.toString();
    ret = ret.replace(/^https?:\/\//, '')
  } catch (e) {
    ret = url;
  }
  return ret;
}

let compareWithMockLevel = (url1, url2, deepMockLevel) => {
  if (typeof url2 !== 'string' || typeof url2 !== 'string') {
    return false;
  }
  url1 = removeURLPortAndProtocol(url1);
  url2 = removeURLPortAndProtocol(url2);
  let inc = deepMockLevel;
  // @ts-ignore
  while (inc > 0) {
    // @ts-ignore
    url1 = url1.replace(url1.split('/', inc).join('/'), '');
    // @ts-ignore
    url2 = url2.replace(url2.split('/', inc).join('/'), '');
    if (url1 && url2) {
      break;
    }
    // @ts-ignore
    inc--;
  }
  url1 = url1.substring(0, 1) === '/' ? url1.substring(1) : url1;
  url2 = url2.substring(0, 1) === '/' ? url2.substring(1) : url2;
  const lg1 = url1.split('/').length;
  const lg2 = url2.split('/').length;
  if (lg1 > lg2) {
    url1 = url1.replace(url1.split('/', (lg1 - lg2)).join('/'), '');
  } else if (lg2 > lg1) {
    url2 = url2.replace(url2.split('/', (lg2 - lg1)).join('/'), '');
  }
  url1 = url1.substring(0, 1) === '/' ? url1.substring(1) : url1;
  url2 = url2.substring(0, 1) === '/' ? url2.substring(1) : url2;
  return new RegExp('^' + url2.replaceAll(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replaceAll('*', '(.*)') + '$').test(url1);
};

/**
 * ajoute le panel tag dans la page
 */
export function addTagsPanel(tags: Tag[]) {
  let display = false;
  // recupération des enregistrements
  chrome.storage.local.get(['tuelloRecords', 'deepMockLevel'], results => {
    if (results['tuelloRecords']) {
      for (const tag of tags) {
        tag.jsonKeyValue = findTagInHttpCalls(tag, results['tuelloRecords'], results.deepMockLevel || 0);
        if(tag.jsonKeyValue) {
          display = true;
        }
      }
      if (display) {
        displayTags(tags);
      }
    }
  });
}

export function deleteTagsPanel() {
  const elements = document.querySelectorAll('#tuelloTags');
  elements.forEach((element) => {
    element.remove();
  });
}

function findTagInHttpCalls(tag: Tag, records: any, deepMockLevel: number) {
  let ret;
  const filteredRecords = records.filter(({ key, reponse, httpCode }) => compareWithMockLevel(tag.httpKey, key, deepMockLevel));
  if (filteredRecords && filteredRecords.length > 0) {
    ret = (findInJson(filteredRecords[0].reponse, tag.jsonKey));
  }
  return ret;
}

function displayTags(tags: Tag[]) {
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