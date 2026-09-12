import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { MosaicUrl } from '../models/mosaic.models';
import { MosaicTileComponent } from '../mosaic-tile/mosaic-tile.component';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicDropTargetTracker, MOSAIC_DROP_ROOT } from '../utils/mosaic-drop-target';
import { MosaicGridNavigationBase } from '../utils/mosaic-grid-navigation.base';

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
export class UrlsGridComponent extends MosaicGridNavigationBase implements OnChanges, OnDestroy {
  @Input() urls: MosaicUrl[] = [];
  @Input() editable = false;
  @Output() reordered = new EventEmitter<MosaicUrl[]>();
  @Output() editUrl = new EventEmitter<MosaicUrl>();
  @Output() deleteUrl = new EventEmitter<MosaicUrl>();
  /** Un site est en cours de glisser : la barre d'outils peut proposer la racine */
  @Output() draggingChange = new EventEmitter<boolean>();
  /** La zone « racine » est survolée : à surligner dans la barre d'outils */
  @Output() rootTargetChange = new EventEmitter<boolean>();
  /** Site lâché sur la zone « racine » : il quitte la catégorie */
  @Output() urlDroppedOnRoot = new EventEmitter<MosaicUrl>();

  displayUrls: MosaicUrl[] = [];

  private launcherService = inject(MosaicLauncherService);
  private ngZone = inject(NgZone);

  /**
   * La zone de dépôt vit dans la barre d'outils, hors de ce composant : le
   * changement d'état est renvoyé au parent, donc émis dans la zone Angular.
   */
  private dropTracker = new MosaicDropTargetTracker(this.ngZone, (target) => this.ngZone.run(() => this.rootTargetChange.emit(target === MOSAIC_DROP_ROOT)));

  override ngOnDestroy(): void {
    this.dropTracker.stopTracking();
    super.ngOnDestroy();
  }

  ngOnChanges(): void {
    this.displayUrls = [...this.urls];
    this.syncNavigation(this.displayUrls.length);
  }

  protected override activateNavItem(index: number, background: boolean): void {
    const url = this.displayUrls[index];
    if (url) {
      this.launcherService.open(url, background);
    }
  }

  selectItem(index: number): void {
    this.navigationService.setActive(index);
  }

  onDragStarted(): void {
    this.draggingChange.emit(true);
    this.dropTracker.start();
  }

  /**
   * Le CDK émet `ended` avant `dropped` : la cible doit survivre jusqu'au lâcher,
   * seule l'écoute du curseur s'arrête ici.
   */
  onDragEnded(): void {
    this.dropTracker.stopTracking();
  }

  drop(event: CdkDragDrop<MosaicUrl[]>): void {
    const onRoot = this.dropTracker.target === MOSAIC_DROP_ROOT;
    this.dropTracker.reset();
    this.draggingChange.emit(false);

    const dragged = event.item.data as MosaicUrl | undefined;
    if (onRoot && dragged) {
      // Retrait immédiat : la tuile ne doit pas rester dans la catégorie le temps
      // de l'écriture dans le storage.
      this.displayUrls = this.displayUrls.filter((url) => url.id !== dragged.id);
      this.syncNavigation(this.displayUrls.length);
      this.urlDroppedOnRoot.emit(dragged);
      return;
    }

    moveItemInArray(this.displayUrls, event.previousIndex, event.currentIndex);
    this.displayUrls = [...this.displayUrls];
    this.syncNavigation(this.displayUrls.length);
    this.reordered.emit(this.displayUrls);
  }
}
