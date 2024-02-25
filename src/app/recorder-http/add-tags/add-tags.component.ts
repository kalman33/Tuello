import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { TagElement } from '../models/TagElement';
import { Router } from '@angular/router';

@Component({
  selector: 'mmn-add-tags',
  templateUrl: './add-tags.component.html',
  styleUrls: ['./add-tags.component.scss'],
  animations: [fadeInAnimation]
})
export class AddTagsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  elements: TagElement[];
  httpKey: string;
  jsonKey: string;
  display: string

  constructor(
    private translate: TranslateService,
    private router: Router

  ) { }

  ngOnInit() {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPTags'], results => {
      this.elements = results['tuelloHTTPTags'];
    });

  }


  addElement() {
    if (this.httpKey && this.jsonKey) {
      if (this.elements && !this.elements.find((tag) => tag.httpKey === this.httpKey && tag.jsonKey === this.jsonKey)) {
        this.elements.push({
          httpKey: this.httpKey,
          jsonKey: this.jsonKey,
          display: this.display || '?'
        });
      } else {
        this.elements = [{
          httpKey: this.httpKey,
          jsonKey: this.jsonKey,
          display: this.display || '?'
        }];
      }
    }

    chrome.storage.local.set({ tuelloHTTPTags: this.elements });
    chrome.runtime.sendMessage({
      action: 'MMA_RECORDS_CHANGE'
    }, () => { });
    this.elements = [...this.elements]

  }

  /**
   * Suppression d'un element
   */
  deleteElement(index: number) {
    if (index >= 0) {
      this.elements.splice(index, 1);
      this.elements = [...this.elements];
      // on sauvegarde 
      chrome.storage.local.set({ tuelloHTTPTags: this.elements });
      chrome.runtime.sendMessage({
        action: 'MMA_RECORDS_CHANGE'
      }, () => { });
    }
  }

  back() {
    this.router.navigateByUrl('/recorder', { skipLocationChange: true });
  }

}
