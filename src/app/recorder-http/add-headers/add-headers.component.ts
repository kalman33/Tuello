import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { HeaderElement } from '../models/HeaderElement';

@Component({
  selector: 'mmn-add-headers',
  templateUrl: './add-headers.component.html',
  styleUrls: ['./add-headers.component.scss'],
  animations: [fadeInAnimation]
})
export class AddHeadersComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  elements: HeaderElement[];
  _headerName: string;
  _headerValue: string;

  constructor(
    private translate: TranslateService,
    public dialogRef: MatDialogRef<AddHeadersComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {

    
  }

  get headerName(): string {
    return this._headerName;
  }

  set headerName(value: string) {
    this._headerName = value;
  }

  get headerValue(): string {
    return this._headerValue;
  }

  set headerValue(value: string) {
    this._headerValue = value;
    //chrome.storage.local.set({ searchAttributeDisplay: value });
  }

  addElement() {
    if (this.elements) {
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
    // chrome.storage.local.set({ tuelloElements: this.elements });
    // chrome.runtime.sendMessage({
    //   action: 'SEARCH_ELEMENTS_ACTIVATED',
    //   value: this.searchElementsActivated
    // }, ()=>{});
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
      // chrome.storage.local.set({ tuelloElements: this.elements });
      // chrome.runtime.sendMessage({
      //   action: 'SEARCH_ELEMENTS_ACTIVATED',
      //   value: this.searchElementsActivated
      // }, ()=>{});
    }
  }

  
}
