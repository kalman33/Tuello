import { Injectable } from '@angular/core';
import { TagElement } from '../models/TagElement';

/**
 * Permet de gérer les tags
 */
@Injectable({
  providedIn: 'root',
})
export class TagsService {
  
  elements: TagElement[];

  constructor() {}

  loadTags() {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPTags'], results => {
      this.elements = results['tuelloHTTPTags'];
    });
  }

  addTagElement(element: TagElement) {
    if (!this.elements) {
      this.loadTags();
    }
    if (this.elements && !this.elements.find((tag) => tag.httpKey === element.httpKey && tag.jsonKey === element.jsonKey)) {
      this.elements.push(element);
    } else {
      this.elements = [element];
    }
    this.updateData();

  }

  updateData() {
    chrome.storage.local.set({ tuelloHTTPTags: this.elements });
    chrome.runtime.sendMessage({
      action: 'MMA_RECORDS_CHANGE'
    }, () => { });
    this.elements = [...this.elements]
  }

  deleteElement(index: number) {
    if (index >= 0) {
      this.elements.splice(index, 1);
      this.elements = [...this.elements];
      // on sauvegarde 
      this.updateData();
    }
  }
  
  

}
