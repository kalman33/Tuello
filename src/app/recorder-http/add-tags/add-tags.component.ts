import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { TagElement } from '../models/TagElement';

@Component({
  selector: 'mmn-add-tags',
  templateUrl: './add-tags.component.html',
  styleUrls: ['./add-tags.component.scss'],
  animations: [fadeInAnimation]
})
export class AddTagsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  elements: TagElement[];
  headerName: string;
  headerValue: string;
  
  constructor(
    private translate: TranslateService,
    public dialogRef: MatDialogRef<AddTagsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPHeaders'], results => {
      this.elements = results['tuelloHTTPHeaders'];
    });
    
  }


  addElement() {
    if (this.headerName) {
      if (this.elements && !this.elements.find((header) => header.name === this.headerName)) {
        this.elements.push({
          name: this.headerName,
          value: this.headerValue
        });
      } else {
        this.elements = [{
          name: this.headerName,
          value: this.headerValue
        }];
      }
    }
    
    chrome.storage.local.set({ tuelloHTTPHeaders: this.elements });
    chrome.runtime.sendMessage({
      action: 'MMA_RECORDS_CHANGE'
    }, () => { });
    this.elements =  [...this.elements]
    
  }

  /**
   * Suppression d'un element
   */
  deleteElement(index: number) {
    if (index >= 0) {
      this.elements.splice(index, 1);
      this.elements = [...this.elements];
      // on sauvegarde 
      chrome.storage.local.set({ tuelloHTTPHeaders: this.elements });
      chrome.runtime.sendMessage({
        action: 'MMA_RECORDS_CHANGE'
      }, () => { });
    }
  }

  
}