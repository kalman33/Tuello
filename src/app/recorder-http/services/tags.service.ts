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

  loadTags(): Promise<void> {
    // recupération des elements
    return new Promise((resolve) => {
      chrome.storage.local.get(['tuelloHTTPTags'], results => {
        this.elements = results['tuelloHTTPTags'] || [];
        resolve();
      });
    });
  }

  async addTagElement(element: TagElement) {
    // S'assurer que les éléments sont chargés
    if (!this.elements) {
      await this.loadTags();
    }

    // Vérifier si le tag n'existe pas déjà avant de l'ajouter
    const exists = this.elements.find((tag) => tag.httpKey === element.httpKey && tag.jsonKey === element.jsonKey);
    if (!exists) {
      this.elements.push(element);
      this.updateData();
    }
  }

  updateData() {
    chrome.storage.local.set({ tuelloHTTPTags: this.elements });
    chrome.runtime.sendMessage({
      action: 'MMA_TAGS_CHANGE'
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
