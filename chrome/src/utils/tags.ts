import { BigJsonViewerDom } from 'big-json-viewer';
import { addcss } from './utils';
import { Tag } from '../models/Tag';

/**
 * ajoute le panel tag dans la page
 */
export function addTagPanel(tags: Tag[]) {
  return new Promise((resolve, reject) => {

    resolveEx = resolve;
    rejectEx = reject;

    addcss(chrome.runtime.getURL('tags.css'));

    <div class="tuello-tag">
        <div class="tuello-front">
        	<div class="tuello-content">
           	 	<p>test: qsdklqsdql</p>
           		 <p>test: qsdkqsdqsdqsdqs qsd qsd lqsdql</p>
           		 <p>test: qsdklqsdql</p>
           		 <p>test: qsdkqsdqsdqsdqs qsd qsd lqsdql</p>
           		 <p>test: qsdklqsdql</p>
           		 <p>test: qsdkqsdqsdqsdqs qsd qsd lqsdql</p>
           		 <p>test: qsdklqsdql</p>
           		 <p>test: qsdkqsdqsdqsdqs qsd qsd lqsdql</p>
        	</div>
        </div>
    </div>

    //TAG
    const tagDiv = document.createElement('div');
    tagDiv.className = "tuello-tag";

    // FRONT
    const frontDiv = document.createElement('div');
    frontDiv.className = "tuello-front";
    tagDiv.appendChild(frontDiv);

    // CONTENT
    const contentDiv = document.createElement('div');
    contentDiv.className = "tuello-content";
    
    // DATAs
    for (const tag of tags) {

    }

    frontDiv.appendChild(contentDiv);
    tagDiv.appendChild(frontDiv);
    document.body.appendChild(tagDiv);

  });
}

export function deleteTagPanel() {
  
}