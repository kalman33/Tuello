import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, inject, Injector, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, viewChild } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MOSAIC_COLLAPSED_SECTIONS_KEY, MosaicUrl } from '../models/mosaic.models';
import { MosaicTileComponent } from '../mosaic-tile/mosaic-tile.component';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicDropTargetTracker, MOSAIC_DROP_ROOT } from '../utils/mosaic-drop-target';
import { MosaicGridNavigationBase } from '../utils/mosaic-grid-navigation.base';
import { buildSections, flattenSections, MosaicSection } from '../utils/mosaic-sections';

/** Section affichée : `navStart` est l'index clavier de sa première tuile */
interface SectionView extends MosaicSection {
  collapsed: boolean;
  navStart: number;
}

@Component({
  selector: 'mmn-urls-grid',
  templateUrl: './urls-grid.component.html',
  styleUrls: ['./urls-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MosaicTileComponent, TranslatePipe, DragDropModule],
  animations: [
    trigger('staggerList', [
      transition(':enter', [
        query('mmn-mosaic-tile', [style({ opacity: 0, transform: 'translateY(40px) scale(0.9)' }), stagger(50, [animate('0.5s cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))])], { optional: true })
      ])
    ])
  ]
})
export class UrlsGridComponent extends MosaicGridNavigationBase implements OnInit, OnChanges, OnDestroy {
  @Input() urls: MosaicUrl[] = [];
  /** Catégorie affichée : elle distingue les sections de même nom dans l'état replié */
  @Input() categoryId: string | null = null;
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

  sections: SectionView[] = [];
  /** Section en cours de renommage, null en dehors */
  renamingSection: string | null = null;

  /** Sites réellement affichés, dans l'ordre de l'index clavier */
  private visibleUrls: MosaicUrl[] = [];
  private collapsedKeys = new Set<string>();

  private renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private launcherService = inject(MosaicLauncherService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(Injector);

  /**
   * La zone de dépôt vit dans la barre d'outils, hors de ce composant : le
   * changement d'état est renvoyé au parent, donc émis dans la zone Angular.
   */
  private dropTracker = new MosaicDropTargetTracker(this.ngZone, (target) => this.ngZone.run(() => this.rootTargetChange.emit(target === MOSAIC_DROP_ROOT)));

  /** Sans zone dédiée, un site ne pourrait plus sortir d'une section quand tous en ont une */
  get hasNamedSections(): boolean {
    return this.sections.some((section) => !!section.name);
  }

  ngOnInit(): void {
    chrome.storage.local.get([MOSAIC_COLLAPSED_SECTIONS_KEY], (result) => {
      this.collapsedKeys = new Set((result[MOSAIC_COLLAPSED_SECTIONS_KEY] as string[] | undefined) ?? []);
      this.rebuild(this.urls);
      this.cdr.detectChanges();
    });
  }

  override ngOnDestroy(): void {
    this.dropTracker.stopTracking();
    super.ngOnDestroy();
  }

  ngOnChanges(): void {
    this.rebuild(this.urls);
  }

  protected override activateNavItem(index: number, background: boolean): void {
    const url = this.visibleUrls[index];
    if (url) {
      this.launcherService.open(url, background);
    }
  }

  selectItem(index: number): void {
    this.navigationService.setActive(index);
  }

  toggleSection(name: string): void {
    const key = this.collapsedKey(name);
    if (this.collapsedKeys.has(key)) {
      this.collapsedKeys.delete(key);
    } else {
      this.collapsedKeys.add(key);
    }
    this.persistCollapsed();
    this.rebuild(flattenSections(this.sections));
    this.navigationService.clearActive();
  }

  startRename(name: string): void {
    this.renamingSection = name;
    afterNextRender(
      () => {
        const input = this.renameInput()?.nativeElement;
        input?.focus();
        input?.select();
      },
      { injector: this.injector }
    );
  }

  /**
   * Entrée retire le champ, ce qui déclenche aussi son `blur` : seul le premier des
   * deux appels trouve un renommage en cours. Un nom déjà pris fusionne les sections.
   */
  commitRename(value: string): void {
    const previous = this.renamingSection;
    if (previous === null) {
      return;
    }
    this.renamingSection = null;
    const name = value.trim();
    if (name && name !== previous) {
      this.applySectionName(previous, name);
    }
  }

  cancelRename(): void {
    this.renamingSection = null;
  }

  /** Les sites rejoignent les sites sans section : seul le regroupement disparaît */
  removeSection(name: string): void {
    this.applySectionName(name, '');
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

  drop(event: CdkDragDrop<string>): void {
    const onRoot = this.dropTracker.target === MOSAIC_DROP_ROOT;
    this.dropTracker.reset();
    this.draggingChange.emit(false);

    const dragged = event.item.data as MosaicUrl | undefined;
    if (onRoot && dragged) {
      // Retrait immédiat : la tuile ne doit pas rester dans la catégorie le temps
      // de l'écriture dans le storage.
      this.rebuild(flattenSections(this.sections).filter((url) => url.id !== dragged.id));
      this.urlDroppedOnRoot.emit(dragged);
      return;
    }

    const source = this.sectionNamed(event.previousContainer.data);
    const target = this.sectionNamed(event.container.data);
    if (!source || !target) {
      return;
    }
    if (source === target) {
      moveItemInArray(target.urls, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(source.urls, target.urls, event.previousIndex, event.currentIndex);
    }
    this.emitCurrentOrder();
  }

  private applySectionName(previous: string, name: string): void {
    if (this.collapsedKeys.delete(this.collapsedKey(previous))) {
      if (name) {
        this.collapsedKeys.add(this.collapsedKey(name));
      }
      this.persistCollapsed();
    }
    const urls = flattenSections(this.sections).map((url) => ((url.group ?? '') === previous ? { ...url, group: name || undefined } : url));
    this.rebuild(urls);
    this.reordered.emit(urls);
  }

  private emitCurrentOrder(): void {
    const urls = flattenSections(this.sections);
    this.rebuild(urls);
    this.reordered.emit(urls);
  }

  private sectionNamed(name: string): SectionView | undefined {
    return this.sections.find((section) => section.name === name);
  }

  /**
   * Toute modification repasse par ici pour recalculer l'index clavier, sans quoi
   * le curseur désignerait une tuile masquée. La liste sans section reste présente
   * dès qu'il existe une section : c'est par elle qu'un site en sort.
   */
  private rebuild(urls: MosaicUrl[]): void {
    const built = buildSections(urls);
    const sections = built.length > 0 && built[0].name ? [{ name: '', urls: [] }, ...built] : built;

    let navStart = 0;
    this.visibleUrls = [];
    this.sections = sections.map((section) => {
      const collapsed = !!section.name && this.collapsedKeys.has(this.collapsedKey(section.name));
      const view = { ...section, collapsed, navStart };
      if (!collapsed) {
        this.visibleUrls.push(...section.urls);
        navStart += section.urls.length;
      }
      return view;
    });
    this.syncNavigation(this.visibleUrls.length);
  }

  private collapsedKey(name: string): string {
    return `${this.categoryId}/${name}`;
  }

  private persistCollapsed(): void {
    chrome.storage.local.set({ [MOSAIC_COLLAPSED_SECTIONS_KEY]: [...this.collapsedKeys] });
  }
}
