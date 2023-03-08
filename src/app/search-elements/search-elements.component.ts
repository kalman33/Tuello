import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';

@Component({
  selector: 'mmn-search-elements',
  templateUrl: './search-elements.component.html',
  styleUrls: ['./search-elements.component.scss']
})
export class SearchElementsComponent implements OnInit {
  @ViewChild('fileInput') fileInput: ElementRef;
  
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  searchElementsActivated: boolean;
  elements: string[];
  _searchData: string;

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
      this.elements.push(this.searchData);
    } else {
      this.elements = [this.searchData]
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
