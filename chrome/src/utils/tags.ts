import { Tag } from '../models/Tag';
import { addcss } from './utils';
import JsonFind from 'json-find';


let compareWithMockLevel = (url1, url2, deepMockLevel) => {
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
export function addTagsPanel(tags: Tag[], records: any, deepMockLevel: number) {

    deepMockLevel = deepMockLevel;

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
      content = document.createElement('div');
      content.innerHTML = `${tag.display}:  ${tag.value}`;
      contentDiv.appendChild(content);
    }
    frontDiv.appendChild(contentDiv);
    tagDiv.appendChild(frontDiv);
    document.body.appendChild(tagDiv);

}

export function deleteTagsPanel() {
  const elements = document.querySelectorAll('#tuelloTags');
  elements.forEach((element) => {
      element.remove();
  });
}