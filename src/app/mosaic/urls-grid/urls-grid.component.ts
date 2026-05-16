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
  imports: [MatIconModule, MosaicTileComponent, TranslatePipe, DragDropModule]
})
export class UrlsGridComponent implements OnChanges {
  @Input() urls: MosaicUrl[] = [];
  @Output() reordered = new EventEmitter<MosaicUrl[]>();

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
