import { animate, query as animQuery, stagger, style, transition, trigger } from '@angular/animations';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, ElementRef, EventEmitter, inject, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { ScenarioStorageService } from '../../core/scenarios/scenario-storage.service';
import { MosaicCategory, MosaicUrl, MOSAIC_TREE_EXPANDED_KEY } from '../models/mosaic.models';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicNavigationService } from '../services/mosaic-navigation.service';
import { faviconFor, splitMatches, TextPart } from '../utils/mosaic-text';

interface TreeUrlNode {
  url: MosaicUrl;
  faviconUrl: string;
  titleParts: TextPart[];
  urlParts: TextPart[];
  /** Position dans l'index clavier, -1 tant que la ligne n'est pas visible */
  navIndex: number;
}

/**
 * Action d'édition demandée depuis une ligne de l'arbre. Un `categoryId` à `null`
 * désigne un site rangé à la racine.
 */
export type MosaicTreeAction =
  | { type: 'edit-url'; categoryId: string | null; url: MosaicUrl }
  | { type: 'delete-url'; categoryId: string | null; url: MosaicUrl }
  | { type: 'add-url'; categoryId: string }
  | { type: 'edit-category'; category: MosaicCategory }
  | { type: 'delete-category'; category: MosaicCategory };

/**
 * Déplacement d'un site dans l'arbre. Un id de conteneur à `null` désigne la
 * racine, côté source comme côté destination.
 */
export interface MosaicUrlMove {
  fromCategoryId: string | null;
  toCategoryId: string | null;
  urlId: string;
  toIndex: number;
}

interface TreeCategoryNode {
  category: MosaicCategory;
  nameParts: TextPart[];
  /** Sites retenus : tous, ou seulement ceux qui correspondent à la recherche */
  urls: TreeUrlNode[];
  navIndex: number;
}

@Component({
  selector: 'mmn-mosaic-tree',
  templateUrl: './mosaic-tree.component.html',
  styleUrls: ['./mosaic-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, DragDropModule, MatIconModule, MatButtonModule, MatTooltipModule, TranslatePipe],
  animations: [
    trigger('staggerTree', [
      transition(':enter', [animQuery('.tree-node', [style({ opacity: 0, transform: 'translateY(12px)' }), stagger(25, [animate('0.3s cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' }))])], { optional: true })])
    ])
  ]
})
export class MosaicTreeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() categories: MosaicCategory[] = [];
  @Input() rootUrls: MosaicUrl[] = [];
  /** Filtre l'arbre au lieu de basculer sur un écran de résultats séparé */
  @Input() query = '';

  @Input() editable = false;

  @Output() urlMoved = new EventEmitter<MosaicUrlMove>();
  @Output() action = new EventEmitter<MosaicTreeAction>();

  rootNodes: TreeUrlNode[] = [];
  categoryNodes: TreeCategoryNode[] = [];

  /**
   * `null` = aucune préférence enregistrée, donc tout est déplié. Un Set vide, lui,
   * veut dire que l'utilisateur a explicitement tout replié. Distinguer les deux
   * évite un arbre entièrement fermé quand les catégories arrivent après le
   * chargement du composant.
   */
  private expandedIds: Set<string> | null = null;
  private scenarioNames = new Map<string, string | null>();
  /** Catégorie d'appartenance de chaque site : `null` pour un site rangé à la racine */
  private categoryByUrlId = new Map<string, string | null>();

  private scenarioStorageService = inject(ScenarioStorageService);
  private launcherService = inject(MosaicLauncherService);
  private navigationService = inject(MosaicNavigationService);
  private host = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);
  private activateSub?: { unsubscribe(): void };

  readonly activeIndex = this.navigationService.activeIndex;

  /**
   * Index clavier des lignes, dans l'ordre où elles s'affichent : sites racine,
   * puis chaque catégorie suivie de ses sites quand elle est dépliée. Recalculé
   * à chaque pliage/dépliage, sinon le curseur pointerait une ligne masquée.
   */
  private navRows: ({ kind: 'url'; url: MosaicUrl } | { kind: 'category'; categoryId: string })[] = [];

  constructor() {
    effect(() => {
      const index = this.activeIndex();
      requestAnimationFrame(() => this.scrollIntoView(index));
    });
  }

  get isSearching(): boolean {
    return this.query.trim().length > 0;
  }

  get hasContent(): boolean {
    return this.rootNodes.length > 0 || this.categoryNodes.length > 0;
  }

  /** Aucun site du tout, par opposition à une recherche sans résultat */
  get isEmpty(): boolean {
    return this.categories.length === 0 && this.rootUrls.length === 0;
  }

  ngOnInit(): void {
    chrome.storage.local.get([MOSAIC_TREE_EXPANDED_KEY], (result) => {
      const stored = result[MOSAIC_TREE_EXPANDED_KEY] as string[] | undefined;
      if (stored) {
        this.expandedIds = new Set(stored);
        this.rebuildNavRows();
        this.cdr.detectChanges();
      }
    });

    this.scenarioStorageService.load().then(() => {
      this.loadScenarioNames();
      this.cdr.detectChanges();
    });

    this.activateSub = this.navigationService.activate$.subscribe(({ index, background }) => {
      const row = this.navRows[index];
      if (!row) {
        return;
      }
      if (row.kind === 'url') {
        this.launcherService.open(row.url, background);
      } else {
        this.toggleCategory(row.categoryId);
      }
    });
  }

  ngOnDestroy(): void {
    this.activateSub?.unsubscribe();
    this.navigationService.reset();
  }

  ngOnChanges(): void {
    this.buildNodes();
    this.loadScenarioNames();
  }

  selectRow(index: number): void {
    this.navigationService.setActive(index);
  }

  private rebuildNavRows(): void {
    const rows: typeof this.navRows = [];
    for (const node of this.rootNodes) {
      node.navIndex = rows.length;
      rows.push({ kind: 'url', url: node.url });
    }
    for (const catNode of this.categoryNodes) {
      catNode.navIndex = rows.length;
      rows.push({ kind: 'category', categoryId: catNode.category.id });
      const expanded = this.isExpanded(catNode.category.id);
      for (const node of catNode.urls) {
        node.navIndex = expanded ? rows.length : -1;
        if (expanded) {
          rows.push({ kind: 'url', url: node.url });
        }
      }
    }
    this.navRows = rows;
    this.navigationService.setCount(rows.length);
  }

  private scrollIntoView(index: number): void {
    if (index < 0) {
      return;
    }
    this.host.nativeElement.querySelector(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  private buildNodes(): void {
    const q = this.query.trim().toLowerCase();

    this.rootNodes = this.rootUrls.filter((url) => this.urlMatches(url, q)).map((url) => this.toUrlNode(url, q));

    this.categoryNodes = this.categories
      .map((category) => {
        const nameMatches = !q || category.name.toLowerCase().includes(q);
        // Une catégorie dont le nom correspond garde tous ses sites : on cherchait
        // la catégorie, pas un site en particulier.
        const urls = [...category.urls].sort((a, b) => a.order - b.order).filter((url) => nameMatches || this.urlMatches(url, q));
        return { category, nameParts: splitMatches(category.name, q), urls: urls.map((url) => this.toUrlNode(url, q)), navIndex: -1 };
      })
      .filter((node) => !q || node.urls.length > 0 || node.category.name.toLowerCase().includes(q));

    this.categoryByUrlId = new Map<string, string | null>();
    for (const url of this.rootUrls) {
      this.categoryByUrlId.set(url.id, null);
    }
    for (const category of this.categories) {
      for (const url of category.urls) {
        this.categoryByUrlId.set(url.id, category.id);
      }
    }

    this.rebuildNavRows();
    this.navigationService.clearActive();
  }

  /** Conteneur d'un site, pour que le shell sache quelle méthode de stockage appeler */
  categoryIdOf(url: MosaicUrl): string | null {
    return this.categoryByUrlId.get(url.id) ?? null;
  }

  private urlMatches(url: MosaicUrl, q: string): boolean {
    if (!q) {
      return true;
    }
    return (url.title ?? '').toLowerCase().includes(q) || (url.url ?? '').toLowerCase().includes(q);
  }

  private toUrlNode(url: MosaicUrl, q: string): TreeUrlNode {
    return { url, faviconUrl: faviconFor(url.url), titleParts: splitMatches(url.title ?? '', q), urlParts: splitMatches(url.url ?? '', q), navIndex: -1 };
  }

  private loadScenarioNames(): void {
    this.scenarioNames.clear();
    const all = [...this.rootUrls, ...this.categories.flatMap((c) => c.urls)];
    for (const url of all) {
      if (url.scenarioId) {
        this.scenarioNames.set(url.id, this.scenarioStorageService.getName(url.scenarioId));
      }
    }
  }

  /** Nom du scénario associé, ou null si aucun (ou scénario supprimé) */
  scenarioName(url: MosaicUrl): string | null {
    return this.scenarioNames.get(url.id) ?? null;
  }

  /** Pendant une recherche l'arbre est déplié d'office, sinon la préférence s'applique */
  isExpanded(categoryId: string): boolean {
    return this.isSearching || this.expandedIds === null || this.expandedIds.has(categoryId);
  }

  toggleCategory(categoryId: string): void {
    if (this.isSearching) {
      return;
    }
    // Première interaction : on part de l'état affiché (tout déplié) pour que le
    // clic ne referme que la catégorie visée.
    const expanded = this.expandedIds ?? new Set(this.categories.map((c) => c.id));
    if (expanded.has(categoryId)) {
      expanded.delete(categoryId);
    } else {
      expanded.add(categoryId);
    }
    this.expandedIds = expanded;
    this.persistExpanded();
    this.rebuildNavRows();
    this.cdr.detectChanges();
  }

  expandAll(): void {
    this.expandedIds = new Set(this.categories.map((c) => c.id));
    this.persistExpanded();
    this.rebuildNavRows();
    this.cdr.detectChanges();
  }

  collapseAll(): void {
    this.expandedIds = new Set();
    this.persistExpanded();
    this.rebuildNavRows();
    this.cdr.detectChanges();
  }

  get allExpanded(): boolean {
    return this.expandedIds === null || (this.categories.length > 0 && this.categories.every((c) => this.expandedIds!.has(c.id)));
  }

  openUrl(url: MosaicUrl, background = false): void {
    this.launcherService.open(url, background);
  }

  drop(event: CdkDragDrop<string | null>): void {
    // Pendant une recherche l'arbre est filtré : les positions affichées ne
    // correspondent plus aux positions réelles, un déplacement serait faux.
    if (this.isSearching) {
      return;
    }
    const fromCategoryId = event.previousContainer.data;
    const toCategoryId = event.container.data;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return;
    }

    const url = event.item.data as MosaicUrl;
    // Déplacement optimiste : sans lui, la ligne reviendrait à sa place le temps
    // de l'écriture dans le storage avant de sauter à la bonne.
    if (event.previousContainer === event.container) {
      moveItemInArray(this.listFor(toCategoryId), event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(this.listFor(fromCategoryId), this.listFor(toCategoryId), event.previousIndex, event.currentIndex);
    }
    this.rootNodes = [...this.rootNodes];
    this.categoryNodes = this.categoryNodes.map((node) => ({ ...node, urls: [...node.urls] }));
    this.rebuildNavRows();
    this.cdr.detectChanges();

    this.urlMoved.emit({ fromCategoryId, toCategoryId, urlId: url.id, toIndex: event.currentIndex });
  }

  private listFor(categoryId: string | null): TreeUrlNode[] {
    if (categoryId === null) {
      return this.rootNodes;
    }
    return this.categoryNodes.find((node) => node.category.id === categoryId)?.urls ?? [];
  }

  trackCategory(_i: number, node: TreeCategoryNode): string {
    return node.category.id;
  }

  trackUrl(_i: number, node: TreeUrlNode): string {
    return node.url.id;
  }

  private persistExpanded(): void {
    chrome.storage.local.set({ [MOSAIC_TREE_EXPANDED_KEY]: [...(this.expandedIds ?? [])] });
  }
}
