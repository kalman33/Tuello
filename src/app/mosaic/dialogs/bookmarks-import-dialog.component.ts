import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MosaicBookmarkEntry, MosaicBookmarksImportResult } from '../models/mosaic.models';
import { MosaicStorageService } from '../services/mosaic-storage.service';

interface BookmarkNode {
  id: string;
  title: string;
  /** Présent uniquement sur les feuilles (favoris) ; absent sur les dossiers. */
  url?: string;
  children?: BookmarkNode[];
  /** Absent sur les racines. Permet de ne recalculer que la chaîne des ancêtres d'un nœud
   * modifié (voir `recomputeAncestors`) plutôt que l'arbre entier à chaque coche. */
  parent?: BookmarkNode;
  checked: boolean;
  indeterminate: boolean;
  /** Un dossier replié n'est pas rendu du tout (voir le template) : avec plusieurs centaines ou
   * milliers de favoris, tout afficher d'un coup rendait le dialogue très lourd à faire défiler
   * (autant d'éléments de case à cocher montés simultanément dans le DOM). Les dossiers racine
   * (Barre de favoris, Autres favoris...) restent dépliés par défaut, leurs sous-dossiers non. */
  expanded: boolean;
}

/**
 * Importe tout ou partie des favoris du navigateur (`chrome.bookmarks`) dans la mosaïque.
 * L'arborescence native des favoris est aplatie dans le modèle "une seule catégorie,
 * directement un niveau d'URLs" de Tuello : chaque favori sélectionné rejoint une catégorie
 * nommée d'après son dossier parent direct (mode "respecter les dossiers"), ou la racine si
 * l'utilisateur préfère tout regrouper à plat.
 *
 * Les cases à cocher sont des `<input>` natifs plutôt que `mat-checkbox` : avec beaucoup de
 * favoris, l'overhead par instance de `mat-checkbox` (ripple, CDK FocusMonitor, ARIA...),
 * multiplié par chaque favori ET chaque dossier affichés, dominait largement le coût de rendu.
 */
@Component({
  selector: 'mmn-bookmarks-import-dialog',
  template: `
    <h2 mat-dialog-title>{{ 'mmn.mosaic.bookmarks.title' | translate }}</h2>
    <mat-dialog-content>
      @if (loading) {
        <div class="bookmarks-loading">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      } @else if (!roots.length) {
        <p class="bookmarks-empty">{{ 'mmn.mosaic.bookmarks.empty' | translate }}</p>
      } @else {
        <mat-radio-group class="bookmarks-mode" [(ngModel)]="groupByFolder">
          <mat-radio-button [value]="true">{{ 'mmn.mosaic.bookmarks.mode.byFolder' | translate }}</mat-radio-button>
          <mat-radio-button [value]="false">{{ 'mmn.mosaic.bookmarks.mode.flat' | translate }}</mat-radio-button>
        </mat-radio-group>

        <div class="bookmarks-toolbar">
          <button mat-button (click)="selectAll()">{{ 'mmn.mosaic.bookmarks.selectAll' | translate }}</button>
          <button mat-button (click)="selectNone()">{{ 'mmn.mosaic.bookmarks.selectNone' | translate }}</button>
        </div>

        <ng-template #nodeTpl let-node="node">
          <div class="bookmark-node">
            <div class="node-row">
              @if (node.children) {
                <button type="button" class="node-expand" (click)="node.expanded = !node.expanded" [attr.aria-label]="node.expanded ? ('mmn.mosaic.bookmarks.collapse' | translate) : ('mmn.mosaic.bookmarks.expand' | translate)">
                  <span class="node-arrow" [class.expanded]="node.expanded">▸</span>
                </button>
              } @else {
                <span class="node-expand-spacer"></span>
              }
              <label class="node-label">
                <input type="checkbox" [checked]="node.checked" [indeterminate]="node.indeterminate" (change)="onToggle(node, !node.checked)" />
                @if (node.children) {
                  <mat-icon class="node-icon">folder</mat-icon>
                }
                <span class="node-title">{{ node.title }}</span>
              </label>
            </div>
            @if (node.children?.length && node.expanded) {
              <div class="bookmark-children">
                @for (child of node.children; track child.id) {
                  <ng-container *ngTemplateOutlet="nodeTpl; context: { node: child }"></ng-container>
                }
              </div>
            }
          </div>
        </ng-template>

        <div class="bookmarks-tree">
          @for (root of roots; track root.id) {
            <ng-container *ngTemplateOutlet="nodeTpl; context: { node: root }"></ng-container>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <span class="bookmarks-count">{{ 'mmn.mosaic.bookmarks.selectedCount' | translate: { count: selectedCount } }}</span>
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      <button mat-flat-button color="accent" [disabled]="!selectedCount" (click)="confirm()">
        {{ 'mmn.mosaic.bookmarks.import.button' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      mat-dialog-content {
        min-width: 420px;
        max-height: 60vh;
      }
      .bookmarks-loading {
        display: flex;
        justify-content: center;
        padding: 32px 0;
      }
      .bookmarks-empty {
        color: #7f8c8d;
        text-align: center;
        padding: 24px 0;
      }
      .bookmarks-mode {
        display: flex;
        gap: 16px;
        margin-bottom: 10px;
      }
      .bookmarks-toolbar {
        margin-bottom: 8px;
      }
      .bookmarks-tree {
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 8px 12px;
      }
      .bookmark-node {
        margin: 1px 0;
      }
      .bookmark-children {
        margin-left: 20px;
        border-left: 1px dashed #ddd;
        padding-left: 8px;
      }
      .node-row {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .node-expand,
      .node-expand-spacer {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      .node-expand {
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .node-arrow {
        display: inline-block;
        font-size: 10px;
        color: #7f8c8d;
        transition: transform 0.15s ease;
      }
      .node-arrow.expanded {
        transform: rotate(90deg);
      }
      .node-label {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        padding: 3px 4px;
        border-radius: 4px;
        min-width: 0;
      }
      .node-label:hover {
        background: rgba(0, 0, 0, 0.04);
      }
      .node-label input[type='checkbox'] {
        flex-shrink: 0;
        margin: 0;
      }
      .node-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        color: #7f8c8d;
        flex-shrink: 0;
      }
      .node-title {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bookmarks-count {
        color: #7f8c8d;
        font-size: 13px;
        margin-right: auto;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatRadioModule, MatIconModule, MatProgressSpinnerModule, FormsModule, NgTemplateOutlet, TranslatePipe]
})
export class BookmarksImportDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<BookmarksImportDialogComponent>);
  private storageService = inject(MosaicStorageService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  roots: BookmarkNode[] = [];
  selectedCount = 0;
  /** true = une catégorie par dossier parent direct, false = tout à la racine, à plat. */
  groupByFolder = true;

  async ngOnInit(): Promise<void> {
    const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => chrome.bookmarks.getTree(resolve));
    const topLevel = tree[0]?.children ?? [];
    this.roots = topLevel.map((node) => this.buildNode(node, undefined, 0)).filter((node): node is BookmarkNode => node !== null);
    this.loading = false;
    this.cdr.detectChanges();
  }

  /** `null` si le dossier (et tous ses sous-dossiers) ne contient aucun favori : inutile de
   * l'afficher dans l'arbre, il n'y aurait jamais rien à cocher dedans. Seuls les dossiers
   * racine (profondeur 0 : Barre de favoris, Autres favoris...) démarrent dépliés. */
  private buildNode(node: chrome.bookmarks.BookmarkTreeNode, parent: BookmarkNode | undefined, depth: number): BookmarkNode | null {
    if (node.url) {
      return { id: node.id, title: node.title || node.url, url: node.url, parent, checked: false, indeterminate: false, expanded: false };
    }
    const folder: BookmarkNode = { id: node.id, title: node.title, parent, checked: false, indeterminate: false, expanded: depth === 0 };
    const children = (node.children ?? []).map((child) => this.buildNode(child, folder, depth + 1)).filter((child): child is BookmarkNode => child !== null);
    if (!children.length) {
      return null;
    }
    folder.children = children;
    return folder;
  }

  /** Ajuste `selectedCount` au fil des feuilles traversées plutôt que de reparcourir tout
   * l'arbre après coup : avec beaucoup de favoris, ce recomptage complet à chaque coche se
   * sentait (coût proportionnel au nombre total de favoris, pas à ce qui vient de changer). */
  private setCheckedRecursive(node: BookmarkNode, checked: boolean): void {
    if (!node.children) {
      if (node.checked !== checked) {
        this.selectedCount += checked ? 1 : -1;
      }
      node.checked = checked;
      node.indeterminate = false;
      return;
    }
    node.checked = checked;
    node.indeterminate = false;
    node.children.forEach((child) => this.setCheckedRecursive(child, checked));
  }

  /** Ne remonte que la chaîne des ancêtres du nœud modifié (coût proportionnel à la profondeur),
   * plutôt que de recalculer l'arbre entier à chaque coche. */
  private recomputeAncestors(node: BookmarkNode): void {
    let current = node.parent;
    while (current) {
      const children = current.children!;
      const allChecked = children.every((child) => child.checked && !child.indeterminate);
      const noneChecked = children.every((child) => !child.checked && !child.indeterminate);
      current.checked = allChecked;
      current.indeterminate = !allChecked && !noneChecked;
      current = current.parent;
    }
  }

  onToggle(node: BookmarkNode, checked: boolean): void {
    this.setCheckedRecursive(node, checked);
    this.recomputeAncestors(node);
  }

  selectAll(): void {
    this.roots.forEach((root) => this.setCheckedRecursive(root, true));
  }

  selectNone(): void {
    this.roots.forEach((root) => this.setCheckedRecursive(root, false));
  }

  private importMessage(result: MosaicBookmarksImportResult): string {
    const messages = [this.translate.instant('mmn.mosaic.bookmarks.import.success', { count: result.imported })];
    if (result.categoriesCreated > 0) {
      messages.push(this.translate.instant('mmn.mosaic.bookmarks.import.categories', { count: result.categoriesCreated }));
    }
    if (result.skippedDuplicates > 0) {
      messages.push(this.translate.instant('mmn.mosaic.bookmarks.import.duplicates', { count: result.skippedDuplicates }));
    }
    return messages.join(' ');
  }

  async confirm(): Promise<void> {
    const entries: MosaicBookmarkEntry[] = [];
    // Un dossier transmet son propre nom à ses enfants directs (feuilles ou sous-dossiers) :
    // un favori est donc toujours catégorisé d'après son dossier parent IMMÉDIAT, l'arborescence
    // plus profonde n'étant pas représentable dans le modèle de catégories de Tuello.
    const walk = (node: BookmarkNode, parentTitle: string) => {
      if (node.url) {
        if (node.checked) {
          entries.push({ categoryName: this.groupByFolder ? parentTitle : null, url: node.url, title: node.title });
        }
        return;
      }
      node.children?.forEach((child) => walk(child, node.title));
    };
    this.roots.forEach((root) => walk(root, root.title));

    const result = await this.storageService.importBookmarks(entries);
    this.snackBar.open(this.importMessage(result), '', { duration: 3000 });
    this.dialogRef.close(true);
  }
}
