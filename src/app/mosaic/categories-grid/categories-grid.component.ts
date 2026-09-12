import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, NgZone, Output } from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslatePipe } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicTileComponent } from '../mosaic-tile/mosaic-tile.component';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicDropTargetTracker } from '../utils/mosaic-drop-target';
import { MosaicGridNavigationBase } from '../utils/mosaic-grid-navigation.base';

export interface GridItem {
  kind: 'category' | 'url';
  data: MosaicCategory | MosaicUrl;
}

/** Site lâché sur une tuile dossier : il quitte la racine pour cette catégorie */
export interface UrlDroppedInCategory {
  urlId: string;
  categoryId: string;
}

@Component({
  selector: 'mmn-categories-grid',
  templateUrl: './categories-grid.component.html',
  styleUrls: ['./categories-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MosaicTileComponent, TranslatePipe, DragDropModule],
  animations: [
    trigger('staggerList', [
      transition(':enter', [
        query(
          'mmn-mosaic-tile',
          [
            style({ opacity: 0, transform: 'translateY(40px) scale(0.9)' }),
            stagger(50, [animate('0.5s cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))])
          ],
          { optional: true }
        )
      ])
    ])
  ]
})
export class CategoriesGridComponent extends MosaicGridNavigationBase {
  @Input() set categories(val: MosaicCategory[]) {
    this._categories = val;
    this.buildGridItems();
  }
  @Input() set rootUrls(val: MosaicUrl[]) {
    this._rootUrls = val;
    this.buildGridItems();
  }
  @Input() editable = false;
  @Output() categorySelected = new EventEmitter<string>();
  @Output() reordered = new EventEmitter<{ categories: MosaicCategory[]; rootUrls: MosaicUrl[] }>();
  @Output() editItem = new EventEmitter<GridItem>();
  @Output() deleteItem = new EventEmitter<GridItem>();
  @Output() urlDroppedInCategory = new EventEmitter<UrlDroppedInCategory>();

  private _categories: MosaicCategory[] = [];
  private _rootUrls: MosaicUrl[] = [];
  gridItems: GridItem[] = [];

  /** Dossier actuellement survolé par le site glissé, null en dehors d'un dossier */
  dropTargetId: string | null = null;
  /**
   * Ordre d'affichage pendant le glisser : le CDK réordonne les tuiles à la volée
   * sans toucher à `gridItems`, or le prédicat de tri a besoin de savoir quelle
   * tuile occupe l'emplacement visé.
   */
  private liveItems: GridItem[] = [];

  private launcherService = inject(MosaicLauncherService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  /** La zone survolée est toujours une tuile dossier : la racine, elle, est déjà affichée */
  private dropTracker = new MosaicDropTargetTracker(this.ngZone, (target) => {
    this.dropTargetId = target;
    this.cdr.detectChanges();
  });

  /**
   * Un site glissé sur un dossier y entre au lieu de prendre sa place : on neutralise
   * le réordonnancement sur les emplacements de dossier, sinon la tuile visée serait
   * décalée par le CDK au moment même où le curseur l'atteint, et deviendrait
   * impossible à viser.
   */
  sortPredicate = (index: number, drag: CdkDrag): boolean => {
    const dragged = drag.data as GridItem | undefined;
    return dragged?.kind !== 'url' || this.liveItems[index]?.kind !== 'category';
  };

  override ngOnDestroy(): void {
    this.dropTracker.stopTracking();
    super.ngOnDestroy();
  }

  /** Entrée / Alt+chiffre : on ouvre le site, ou on entre dans la catégorie */
  protected override activateNavItem(index: number, background: boolean): void {
    const item = this.gridItems[index];
    if (!item) {
      return;
    }
    if (item.kind === 'category') {
      this.categorySelected.emit((item.data as MosaicCategory).id);
    } else {
      this.launcherService.open(item.data as MosaicUrl, background);
    }
  }

  selectItem(index: number): void {
    this.navigationService.setActive(index);
  }

  private buildGridItems(): void {
    const catMax = this._categories.length > 0 ? Math.max(...this._categories.map((c) => c.order)) : -1;
    const urlMax = this._rootUrls.length > 0 ? Math.max(...this._rootUrls.map((u) => u.order)) : -1;
    // Si les ordres sont encore indépendants (0..N-1 pour chaque type), afficher cats d'abord puis urls.
    // Après un premier drag-drop, les ordres sont unifiés et on trie par ordre global.
    const independentOrders = catMax <= this._categories.length - 1 && urlMax <= this._rootUrls.length - 1;

    if (independentOrders) {
      this.gridItems = [...[...this._categories].sort((a, b) => a.order - b.order).map((c) => ({ kind: 'category' as const, data: c })), ...[...this._rootUrls].sort((a, b) => a.order - b.order).map((u) => ({ kind: 'url' as const, data: u }))];
    } else {
      const all: GridItem[] = [...this._categories.map((c) => ({ kind: 'category' as const, data: c })), ...this._rootUrls.map((u) => ({ kind: 'url' as const, data: u }))];
      all.sort((a, b) => a.data.order - b.data.order);
      this.gridItems = all;
    }

    this.syncNavigation(this.gridItems.length);
  }

  get hasItems(): boolean {
    return this.gridItems.length > 0;
  }

  onTileClick(item: GridItem): void {
    if (item.kind === 'category') {
      this.categorySelected.emit((item.data as MosaicCategory).id);
    }
  }

  /** Le suivi du curseur n'a de sens que pour un site : un dossier ne se range pas dans un dossier */
  onDragStarted(item: GridItem): void {
    this.liveItems = [...this.gridItems];
    if (item.kind === 'url') {
      this.dropTracker.start();
    }
  }

  /**
   * Le CDK émet `ended` avant `dropped` : la cible doit survivre jusqu'au lâcher,
   * seule l'écoute du curseur s'arrête ici.
   */
  onDragEnded(): void {
    this.dropTracker.stopTracking();
  }

  /** Suit le réordonnancement en cours pour garder `liveItems` aligné sur l'affichage */
  onSorted(event: { previousIndex: number; currentIndex: number }): void {
    moveItemInArray(this.liveItems, event.previousIndex, event.currentIndex);
  }

  drop(event: CdkDragDrop<GridItem[]>): void {
    const targetCategoryId = this.dropTargetId;
    this.dropTracker.reset();

    const dragged = event.item.data as GridItem | undefined;
    if (targetCategoryId && dragged?.kind === 'url') {
      // Retrait immédiat : la tuile ne doit pas rester à la racine le temps de
      // l'écriture dans le storage.
      this.gridItems = this.gridItems.filter((item) => item !== dragged);
      this.syncNavigation(this.gridItems.length);
      this.urlDroppedInCategory.emit({ urlId: (dragged.data as MosaicUrl).id, categoryId: targetCategoryId });
      return;
    }

    moveItemInArray(this.gridItems, event.previousIndex, event.currentIndex);
    this.gridItems = [...this.gridItems];
    this.syncNavigation(this.gridItems.length);
    const newCategories: MosaicCategory[] = [];
    const newRootUrls: MosaicUrl[] = [];
    this.gridItems.forEach((item, i) => {
      if (item.kind === 'category') {
        newCategories.push({ ...(item.data as MosaicCategory), order: i });
      } else {
        newRootUrls.push({ ...(item.data as MosaicUrl), order: i });
      }
    });
    this.reordered.emit({ categories: newCategories, rootUrls: newRootUrls });
  }
}
