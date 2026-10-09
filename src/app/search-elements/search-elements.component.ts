import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatList, MatListItem } from '@angular/material/list';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ElementComponent } from './element/element.component';
import { getDisplayModeLabelKeys, getDisplayModes, SEARCH_ELEMENT_TYPES, SearchElement, SearchElementDisplayMode, SearchElementType, usesDisplayAttribute } from './models/SearchElement';

/** Exemple affiché dans le champ de saisie selon le type choisi */
const PLACEHOLDERS: Record<SearchElementType, string> = {
  auto: '',
  tag: 'Ex. h1',
  attribute: 'Ex. data-testid',
  text: 'Ex. Valider la commande',
  css: 'Ex. .btn-primary, [data-testid]'
};

@Component({
  selector: 'mmn-search-elements',
  templateUrl: './search-elements.component.html',
  styleUrls: ['./search-elements.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatSlideToggle, MatFormField, MatLabel, MatInput, MatSelect, MatOption, MatIconButton, MatTooltip, MatIcon, MatList, MatListItem, ElementComponent, TranslatePipe]
})
export class SearchElementsComponent implements OnInit {
  readonly types = SEARCH_ELEMENT_TYPES;
  readonly getDisplayModeLabelKeys = getDisplayModeLabelKeys;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  searchElementsActivated = false;
  elements: SearchElement[] = [];
  searchData: string;
  searchType: SearchElementType = 'tag';
  displayMode: SearchElementDisplayMode = 'both';
  searchAttributeDisplay: string;

  constructor(
    private translate: TranslateService,
    private infoBar: MatSnackBar,
    private ref: ChangeDetectorRef
  ) {}

  get placeholder(): string {
    return PLACEHOLDERS[this.searchType];
  }

  get displayModes(): SearchElementDisplayMode[] {
    return getDisplayModes(this.searchType);
  }

  /** L'attribut à afficher ne sert que si une valeur est affichée pour une balise ou un sélecteur */
  get showAttributeField(): boolean {
    return usesDisplayAttribute(this.searchType) && this.showsValue(this.displayMode);
  }

  onTypeChange(type: SearchElementType) {
    this.searchType = type;
    // Ex. passage à « Texte » : seuls « nom » et « aucun » restent possibles
    if (!this.displayModes.includes(this.displayMode)) {
      this.displayMode = this.displayModes[0];
    }
  }

  ngOnInit() {
    chrome.storage.local.get(['tuelloElements', 'searchElementsActivated', 'searchAttributeDisplay', 'searchElementType', 'searchElementDisplayMode'], (results: Record<string, any>) => {
      this.elements = Array.isArray(results['tuelloElements']) ? results['tuelloElements'] : [];
      this.searchElementsActivated = !!results['searchElementsActivated'];
      // Derniers attribut, type et affichage utilisés : pré-remplis pour l'ajout suivant
      this.searchAttributeDisplay = results['searchAttributeDisplay'];
      if (SEARCH_ELEMENT_TYPES.includes(results['searchElementType'])) {
        this.searchType = results['searchElementType'];
      }
      if (this.displayModes.includes(results['searchElementDisplayMode'])) {
        this.displayMode = results['searchElementDisplayMode'];
      } else {
        this.onTypeChange(this.searchType);
      }
      // OnPush : les callbacks chrome.storage ne déclenchent pas la détection de changements
      this.ref.detectChanges();
    });
  }

  /**
   * Permet d'activer le mode play
   */
  toggleSearchPlay(e) {
    if (this.searchElementsActivated && !this.elements.length) {
      // il faut que l'input des données à rechercher soit renseigné
      this.showMessage('mmn.search.elements.required');
      // on n'active pas : ni sauvegarde, ni message vers la page
      this.searchElementsActivated = false;
      e.source.checked = false;
      return;
    }

    // Les pages suivent ce réglage via chrome.storage.onChanged (voir searchElements.ts)
    chrome.storage.local.set({ searchElementsActivated: this.searchElementsActivated });
  }

  addElement() {
    const name = this.searchData?.trim();
    // Attribut gardé seulement s'il sert : sinon il fausserait la détection des doublons
    const displayAttribute = this.showAttributeField ? this.searchAttributeDisplay?.trim() || '' : '';
    if (!name) {
      this.showMessage('mmn.search.elements.required');
      return;
    }
    if (!this.isValid(name, this.searchType)) {
      this.showMessage('mmn.search.elements.invalid');
      return;
    }
    if (this.showAttributeField && !displayAttribute) {
      this.showMessage('mmn.search.elements.attribute.required');
      return;
    }
    const isDuplicate = this.elements.some((element) => element.name === name && (element.type ?? 'auto') === this.searchType && (element.displayAttribute || '') === displayAttribute && element.displayMode === this.displayMode);
    if (isDuplicate) {
      this.showMessage('mmn.search.elements.duplicate');
      return;
    }

    this.elements = [...this.elements, { name, type: this.searchType, displayAttribute, displayMode: this.displayMode }];
    // Le champ est vidé ; type, affichage et attribut sont gardés (et mémorisés) pour les ajouts suivants
    this.searchData = '';
    chrome.storage.local.set({
      tuelloElements: this.elements,
      searchElementType: this.searchType,
      searchElementDisplayMode: this.displayMode,
      ...(displayAttribute ? { searchAttributeDisplay: displayAttribute } : {})
    });
  }

  /**
   * Suppression d'un element
   */
  deleteElement(index: number) {
    if (index >= 0 && index < this.elements.length) {
      this.elements = this.elements.filter((_, i) => i !== index);
      // on sauvegarde
      chrome.storage.local.set({ tuelloElements: this.elements });
    }
  }

  private showsValue(mode: SearchElementDisplayMode): boolean {
    return mode === 'value' || mode === 'both';
  }

  /** Refuse ce que la page ne pourrait jamais trouver (balise ou sélecteur mal formé) */
  private isValid(name: string, type: SearchElementType): boolean {
    switch (type) {
      case 'tag':
        return /^<?\s*[a-zA-Z][a-zA-Z0-9-]*\s*\/?>?$/.test(name);
      case 'attribute':
        return /^[^\s"'>/=]+$/.test(name);
      case 'css':
        try {
          document.createDocumentFragment().querySelector(name);
          return true;
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  private showMessage(key: string) {
    this.infoBar.open(this.translate.instant(key), '', {
      duration: 2000,
      verticalPosition: 'top',
      horizontalPosition: 'center'
    });
  }
}
