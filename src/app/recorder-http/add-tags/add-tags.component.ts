import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion';
import { MatFormField, MatLabel } from '@angular/material/form-field';
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
    imports: [FlexModule, FormsModule, MatDialogTitle, MatIconButton, MatIcon, NgClass, ExtendedModule, MatFormField, MatLabel, MatInput, MatTooltip, MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle, TranslatePipe]
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
        chrome.storage.local.get(['tuelloHTTPTags'], (result) => {
            if (!chrome.runtime.lastError) {
                this.tagsService.elements = result['tuelloHTTPTags'];
            }
            this.dataLoaded = true;
            this.cdr.detectChanges();
        });
    }

    trackByFn(index: number, item: TagElement): string {
        return item.httpKey + item.jsonKey;
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

    public onChange(): void {
        this.tagsService.updateData();
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
