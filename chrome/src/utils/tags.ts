import { Tag } from '../models/Tag';
import { addcss } from './utils';

/**
 * ajoute le panel tag dans la page
 */
export function addTagPanel(tags: Tag[]) {

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

export function deleteTagPanel() {
  const elements = document.querySelectorAll('#tuelloTags');
  elements.forEach((element) => {
      element.remove();
  });
}