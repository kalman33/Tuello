import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { SearchElement } from './models/SearchElement';
import { ElementComponent } from './element/element.component';
import { CdkVirtualScrollViewport, CdkFixedSizeVirtualScroll, CdkVirtualForOf } from '@angular/cdk/scrolling';
import { MatList, MatListItem } from '@angular/material/list';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIconButton } from '@angular/material/button';
import { MatInput } from '@angular/material/input';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { NgClass } from '@angular/common';
import { FlexModule } from '@ngbracket/ngx-layout/flex';

@Component({
    selector: 'mmn-search-elements',
    templateUrl: './search-elements.component.html',
    styleUrls: ['./search-elements.component.scss'],
    standalone: true,
    imports: [FlexModule, NgClass, ExtendedModule, MatSlideToggle, FormsModule, MatFormField, MatLabel, MatInput, MatIconButton, MatTooltip, MatIcon, MatList, CdkVirtualScrollViewport, CdkFixedSizeVirtualScroll, CdkVirtualForOf, MatListItem, ElementComponent, TranslateModule]
})
export class SearchElementsComponent implements OnInit {
  @ViewChild('fileInput') fileInput: ElementRef;
  
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  searchElementsActivated: boolean;
  elements: SearchElement[];
  _searchData: string;
  _searchAttributeDisplay: string;

  constructor(
    private translate: TranslateService,
    public dialog: MatDialog,
    private infoBar: MatSnackBar,
    private ref: ChangeDetectorRef
  ) {
    
  }

  get searchData(): string {
    return this._searchData;
  }

  set searchData(value: string) {
    this._searchData = value;
  }

  get searchAttributeDisplay(): string {
    return this._searchAttributeDisplay;
  }

  set searchAttributeDisplay(value: string) {
    this._searchAttributeDisplay = value;
    chrome.storage.local.set({ searchAttributeDisplay: value });
  }

  ngOnInit() {

    // recupération des elements
   chrome.storage.local.get(['tuelloElements'], results => {
      this.elements = results['tuelloElements'];
    });
    chrome.storage.local.get(['searchElementsActivated'], results => {
      if (results['searchElementsActivated']) {
        this.searchElementsActivated = results['searchElementsActivated'];
        chrome.runtime.sendMessage({
          action: 'SEARCH_ELEMENTS_ACTIVATED',
          value: true
        }, ()=>{});
      }
      this.ref.detectChanges();
    });

    // récupération du search attribute to display
    chrome.storage.local.get(['searchAttributeDisplay'], results => {
      this.searchAttributeDisplay = results['searchAttributeDisplay'];
    });
   
  }


  /**
   * Permet d'activer le mode play
   */
  toggleSearchPlay(e) {
    if (this.searchElementsActivated && !this.elements) {
      // il faut que l'input des données à rechercher soit renseigné
      this.infoBar.open(this.translate.instant('mmn.search.elements.required'), '', {
        duration: 2000,
        verticalPosition: 'top',
        horizontalPosition: 'center'
      });
      e.source.checked = false;
    } 

    chrome.storage.local.set({ searchElementsActivated: this.searchElementsActivated });
    chrome.runtime.sendMessage({
      action: 'SEARCH_ELEMENTS_ACTIVATED',
      value: this.searchElementsActivated
    }, ()=>{});
  }

  addElement() {
    if (this.elements) {
      this.elements.push({
        name: this.searchData,
        displayAttribute: this.searchAttributeDisplay
      });
    } else {
      this.elements = [{
        name: this.searchData,
        displayAttribute: this.searchAttributeDisplay
      }];
    }
    chrome.storage.local.set({ tuelloElements: this.elements });
    chrome.runtime.sendMessage({
      action: 'SEARCH_ELEMENTS_ACTIVATED',
      value: this.searchElementsActivated
    }, ()=>{});
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
      chrome.storage.local.set({ tuelloElements: this.elements });
      chrome.runtime.sendMessage({
        action: 'SEARCH_ELEMENTS_ACTIVATED',
        value: this.searchElementsActivated
      }, ()=>{});
    }
  }
  

}
