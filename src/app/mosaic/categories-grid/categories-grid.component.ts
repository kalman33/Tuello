import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslatePipe } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicTileComponent } from '../mosaic-tile/mosaic-tile.component';

export interface GridItem {
  kind: 'category' | 'url';
  data: MosaicCategory | MosaicUrl;
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
export class CategoriesGridComponent {
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

  private _categories: MosaicCategory[] = [];
  private _rootUrls: MosaicUrl[] = [];
  gridItems: GridItem[] = [];

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
  }

  get hasItems(): boolean {
    return this.gridItems.length > 0;
  }

  onTileClick(item: GridItem): void {
    if (item.kind === 'category') {
      this.categorySelected.emit((item.data as MosaicCategory).id);
    }
  }

  drop(event: CdkDragDrop<GridItem[]>): void {
    moveItemInArray(this.gridItems, event.previousIndex, event.currentIndex);
    this.gridItems = [...this.gridItems];
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
