import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { MosaicUrl } from '../models/mosaic.models';
import { MosaicTileComponent } from '../mosaic-tile/mosaic-tile.component';

@Component({
  selector: 'mmn-urls-grid',
  templateUrl: './urls-grid.component.html',
  styleUrls: ['./urls-grid.component.scss'],
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
export class UrlsGridComponent implements OnChanges {
  @Input() urls: MosaicUrl[] = [];
  @Input() editable = false;
  @Output() reordered = new EventEmitter<MosaicUrl[]>();
  @Output() editUrl = new EventEmitter<MosaicUrl>();
  @Output() deleteUrl = new EventEmitter<MosaicUrl>();

  displayUrls: MosaicUrl[] = [];

  ngOnChanges(): void {
    this.displayUrls = [...this.urls];
  }

  drop(event: CdkDragDrop<MosaicUrl[]>): void {
    moveItemInArray(this.displayUrls, event.previousIndex, event.currentIndex);
    this.displayUrls = [...this.displayUrls];
    this.reordered.emit(this.displayUrls);
  }
}
