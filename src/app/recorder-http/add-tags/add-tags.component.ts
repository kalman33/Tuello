import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion';
import { MatFormField } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from '@ngx-translate/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { TagElement } from '../models/TagElement';
import { TagsService } from '../services/tags.service';

@Component({
  selector: 'mmn-add-tags',
  templateUrl: './add-tags.component.html',
  styleUrls: ['./add-tags.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInAnimation],
  imports: [FlexModule, FormsModule, MatDialogTitle, MatIconButton, MatIcon, NgClass, ExtendedModule, MatFormField, MatInput, MatTooltip, MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle, TranslatePipe]
})
export class AddTagsComponent {
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  tagsService = inject(TagsService);

  httpKey: string;
  jsonKey: string;
  display: string;
  dataLoaded = false;

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    chrome.storage.local.get(['tuelloHTTPTags'], (result: Record<string, any>) => {
      if (!chrome.runtime.lastError) {
        this.tagsService.elements = result['tuelloHTTPTags'];
      }
      this.dataLoaded = true;
      this.cdr.detectChanges();
    });
  }

  addElement() {
    if (this.httpKey && this.jsonKey) {
      const element: TagElement = {
        httpKey: this.httpKey,
        jsonKey: this.jsonKey,
        display: this.display || '?'
      };
      this.tagsService.addTagElement(element);
    }
  }

  /**
   * Modification du libellé, de l'url de l'api ou de la clef json d'un tag existant.
   * Une valeur vide est refusée : le champ reprend sa valeur précédente.
   */
  updateKey(element: TagElement, field: 'display' | 'httpKey' | 'jsonKey', input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) {
      input.value = element[field];
      return;
    }
    if (value !== element[field]) {
      element[field] = value;
      this.tagsService.updateData();
    }
  }

  /**
   * Suppression d'un element
   */
  deleteElement(index: number) {
    this.tagsService.deleteElement(index);
  }

  back() {
    this.router.navigateByUrl('/recorder', { skipLocationChange: true });
  }
}
