import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, NgZone, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/confirmation-dialog/confirmation-dialog.component';
import { CategoriesGridComponent, GridItem } from '../categories-grid/categories-grid.component';
import { AddCategoryDialogComponent } from '../dialogs/add-category-dialog.component';
import { AddUrlDialogComponent, AddUrlDialogResult } from '../dialogs/add-url-dialog.component';
import { MosaicCategory, MosaicUrl, MosaicViewMode, MOSAIC_VIEW_MODE_KEY } from '../models/mosaic.models';
import { MosaicToolbarComponent } from '../mosaic-toolbar/mosaic-toolbar.component';
import { MosaicTreeAction, MosaicTreeComponent, MosaicUrlMove } from '../mosaic-tree/mosaic-tree.component';
import { MosaicSearchResultsComponent } from '../search-results/search-results.component';
import { MosaicNavigationService } from '../services/mosaic-navigation.service';
import { MosaicStorageService } from '../services/mosaic-storage.service';
import { UrlsGridComponent } from '../urls-grid/urls-grid.component';

@Component({
  selector: 'mmn-mosaic-shell',
  templateUrl: './mosaic-shell.component.html',
  styleUrls: ['./mosaic-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MosaicToolbarComponent, CategoriesGridComponent, UrlsGridComponent, MosaicTreeComponent, MosaicSearchResultsComponent, MatDialogModule, MatSnackBarModule]
})
export class MosaicShellComponent implements OnInit, OnDestroy {
  selectedCategoryId = signal<string | null>(null);
  selectedCategory: MosaicCategory | null = null;
  categories: MosaicCategory[] = [];
  rootUrls: MosaicUrl[] = [];
  categoryUrls: MosaicUrl[] = [];

  searchQuery = signal<string>('');
  isSearching = computed(() => this.searchQuery().trim().length > 0);

  viewMode = signal<MosaicViewMode>('grid');
  /**
   * Volontairement non persisté : un mode édition encore actif après un
   * rechargement inviterait aux suppressions accidentelles.
   */
  editMode = signal(false);
  /**
   * En vue arbre la recherche filtre l'arbre sur place et tout est déjà déplié :
   * ni l'écran de résultats ni la navigation par catégorie n'ont lieu d'être.
   */
  showSearchResults = computed(() => this.isSearching() && this.viewMode() === 'grid');
  showBack = computed(() => this.viewMode() === 'grid' && !!this.selectedCategoryId() && !this.isSearching());

  toolbar = viewChild(MosaicToolbarComponent);

  private storageService = inject(MosaicStorageService);
  private navigationService = inject(MosaicNavigationService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  private titleService = inject(Title);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private storageChangeListener: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void;
  private titleStreamSub?: { unsubscribe(): void };

  private onPopState = () => {
    if (this.selectedCategoryId()) {
      this.closeCategory();
    }
  };

  /**
   * Raccourcis du lanceur. Le champ de recherche garde le focus en permanence,
   * donc l'écoute est posée sur le document : les flèches et Entrée doivent
   * fonctionner sans quitter la saisie.
   */
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || this.isTypingElsewhere(event)) {
      return;
    }

    // Alt+1..9 : ouverture directe du Nième élément listé. On lit `code` et non
    // `key` : en AZERTY les chiffres demandent Shift, et sous macOS Alt+chiffre
    // produit un caractère spécial — dans les deux cas `key` ne vaut pas le chiffre.
    const digit = event.altKey ? /^Digit([1-9])$/.exec(event.code) : null;
    if (digit) {
      event.preventDefault();
      this.navigationService.activate(Number(digit[1]) - 1, event.ctrlKey || event.metaKey);
      return;
    }
    if (event.altKey || event.shiftKey) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigationService.moveBy(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigationService.moveBy(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.navigationService.activateCurrent(event.ctrlKey || event.metaKey);
        break;
      case 'Escape':
        event.preventDefault();
        // Échap efface d'abord la recherche, puis seulement le curseur : sinon on
        // perdrait la liste avant d'avoir pu la reparcourir.
        if (this.isSearching()) {
          this.toolbar()?.clearSearch();
        } else {
          this.navigationService.clearActive();
        }
        break;
      default:
        break;
    }
  };

  /** Une saisie ailleurs que dans la recherche de la mosaïque garde ses touches */
  private isTypingElsewhere(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }
    const isSearchInput = target.classList?.contains('search-input');
    const editable = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    return editable && !isSearchInput;
  }

  ngOnInit() {
    window.addEventListener('popstate', this.onPopState);
    document.addEventListener('keydown', this.onKeyDown);

    chrome.storage.local.get(['darkMode', MOSAIC_VIEW_MODE_KEY], (result) => {
      if (result['darkMode']) {
        document.body.classList.remove('default-theme');
        document.body.classList.add('black-theme');
      }
      const mode = result[MOSAIC_VIEW_MODE_KEY] as MosaicViewMode | undefined;
      if (mode === 'tree' || mode === 'grid') {
        this.viewMode.set(mode);
        this.cdr.detectChanges();
      }
    });

    this.titleStreamSub = this.translate.stream('mmn.layout.mosaic').subscribe((title: string) => {
      if (title && title !== 'mmn.layout.mosaic') {
        this.titleService.setTitle(title);
      }
    });

    this.storageChangeListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      this.ngZone.run(() => {
        if (changes['language']) {
          const newLang = (changes['language'].newValue as string) ?? 'en';
          if (newLang !== this.translate.currentLang) {
            this.translate.use(newLang);
          }
        }
        if (changes['darkMode']) {
          const dark = changes['darkMode'].newValue;
          document.body.classList.toggle('default-theme', !dark);
          document.body.classList.toggle('black-theme', !!dark);
        }
        if (changes[MOSAIC_VIEW_MODE_KEY]) {
          const mode = changes[MOSAIC_VIEW_MODE_KEY].newValue as MosaicViewMode;
          if (mode === 'tree' || mode === 'grid') {
            this.applyViewMode(mode);
          }
        }
      });
    };
    chrome.storage.onChanged.addListener(this.storageChangeListener);

    this.storageService.loadConfig();

    this.storageService.config$.subscribe((config) => {
      this.categories = [...config.categories].sort((a, b) => a.order - b.order);
      this.rootUrls = [...(config.urls ?? [])].sort((a, b) => a.order - b.order);
      if (this.selectedCategoryId()) {
        this.selectedCategory = config.categories.find((c) => c.id === this.selectedCategoryId()) ?? null;
        this.categoryUrls = this.selectedCategory ? [...this.selectedCategory.urls].sort((a, b) => a.order - b.order) : [];
      }
      this.cdr.detectChanges();
    });
  }

  selectCategory(categoryId: string) {
    const config = this.storageService.config$;
    config
      .subscribe((c) => {
        this.selectedCategory = c.categories.find((cat) => cat.id === categoryId) ?? null;
        this.categoryUrls = this.selectedCategory ? [...this.selectedCategory.urls].sort((a, b) => a.order - b.order) : [];
      })
      .unsubscribe();
    this.selectedCategoryId.set(categoryId);
    history.pushState({ categoryId }, '');
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('keydown', this.onKeyDown);
    if (this.storageChangeListener) {
      chrome.storage.onChanged.removeListener(this.storageChangeListener);
    }
    this.titleStreamSub?.unsubscribe();
  }

  goBack() {
    history.back();
  }

  private closeCategory() {
    this.selectedCategoryId.set(null);
    this.selectedCategory = null;
    this.categoryUrls = [];
    this.cdr.detectChanges();
  }

  onViewModeChange(mode: MosaicViewMode): void {
    this.applyViewMode(mode);
    chrome.storage.local.set({ [MOSAIC_VIEW_MODE_KEY]: mode });
  }

  private applyViewMode(mode: MosaicViewMode): void {
    if (mode === this.viewMode()) {
      return;
    }
    // L'arbre affiche tout d'un bloc : rester "dans" une catégorie n'aurait plus
    // de sens, et le retour arrière pointerait vers un écran devenu invisible.
    if (mode === 'tree' && this.selectedCategoryId()) {
      history.back();
    }
    this.viewMode.set(mode);
    this.cdr.detectChanges();
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.cdr.detectChanges();
  }

  async onGridReordered(event: { categories: MosaicCategory[]; rootUrls: MosaicUrl[] }): Promise<void> {
    await this.storageService.reorderGridItems(event.categories, event.rootUrls);
  }

  onEditModeChange(enabled: boolean): void {
    this.editMode.set(enabled);
    this.cdr.detectChanges();
  }

  /** Le « + » de la barre ajoute dans la catégorie ouverte, sinon à la racine */
  addUrl(): void {
    const categoryId = this.viewMode() === 'grid' ? this.selectedCategoryId() : null;
    this.openUrlDialog(null, categoryId);
  }

  addCategory(): void {
    this.dialog
      .open(AddCategoryDialogComponent, { data: {} })
      .afterClosed()
      .pipe(take(1))
      .subscribe((name: string) => {
        if (name) {
          this.storageService.addCategory(name);
        }
      });
  }

  onGridEdit(item: GridItem): void {
    if (item.kind === 'category') {
      this.editCategory(item.data as MosaicCategory);
    } else {
      this.openUrlDialog(item.data as MosaicUrl, null);
    }
  }

  onGridDelete(item: GridItem): void {
    if (item.kind === 'category') {
      this.deleteCategory(item.data as MosaicCategory);
    } else {
      this.storageService.deleteRootUrl((item.data as MosaicUrl).id);
    }
  }

  onCategoryUrlEdit(url: MosaicUrl): void {
    this.openUrlDialog(url, this.selectedCategoryId());
  }

  onCategoryUrlDelete(url: MosaicUrl): void {
    const categoryId = this.selectedCategoryId();
    if (categoryId) {
      this.storageService.deleteUrl(categoryId, url.id);
    }
  }

  onTreeAction(action: MosaicTreeAction): void {
    switch (action.type) {
      case 'edit-url':
        this.openUrlDialog(action.url, action.categoryId);
        break;
      case 'delete-url':
        if (action.categoryId) {
          this.storageService.deleteUrl(action.categoryId, action.url.id);
        } else {
          this.storageService.deleteRootUrl(action.url.id);
        }
        break;
      case 'add-url':
        this.openUrlDialog(null, action.categoryId);
        break;
      case 'edit-category':
        this.editCategory(action.category);
        break;
      case 'delete-category':
        this.deleteCategory(action.category);
        break;
      default:
        break;
    }
  }

  /** Création si `url` vaut null, modification sinon. `categoryId` null = racine. */
  private openUrlDialog(url: MosaicUrl | null, categoryId: string | null): void {
    this.dialog
      .open(AddUrlDialogComponent, { data: url ? { url: url.url, title: url.title, scenarioId: url.scenarioId } : {} })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result: AddUrlDialogResult) => {
        if (!result) {
          return;
        }
        if (url) {
          const updated: MosaicUrl = { ...url, url: result.url, title: result.title, scenarioId: result.scenarioId };
          if (categoryId) {
            this.storageService.updateUrl(categoryId, updated);
          } else {
            this.storageService.updateRootUrl(updated);
          }
        } else if (categoryId) {
          this.storageService.addUrl(categoryId, result.url, result.title, result.scenarioId);
        } else {
          this.storageService.addRootUrl(result.url, result.title, result.scenarioId);
        }
      });
  }

  private editCategory(category: MosaicCategory): void {
    this.dialog
      .open(AddCategoryDialogComponent, { data: { name: category.name } })
      .afterClosed()
      .pipe(take(1))
      .subscribe((name: string) => {
        if (name) {
          this.storageService.updateCategory({ ...category, name });
        }
      });
  }

  /**
   * Seule suppression confirmée : elle emporte tous les sites de la catégorie,
   * contrairement à celle d'un site isolé.
   */
  private deleteCategory(category: MosaicCategory): void {
    const message = this.translate.instant('mmn.mosaic.category.delete.confirm', { name: category.name, count: category.urls.length });
    this.dialog
      .open(ConfirmDialogComponent, { data: { message } })
      .afterClosed()
      .pipe(take(1))
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.storageService.deleteCategory(category.id);
        }
      });
  }

  async onUrlMoved(move: MosaicUrlMove): Promise<void> {
    await this.storageService.moveUrl(move.fromCategoryId, move.toCategoryId, move.urlId, move.toIndex);
  }

  async onUrlsReordered(urls: MosaicUrl[]): Promise<void> {
    const catId = this.selectedCategoryId();
    if (catId) {
      await this.storageService.reorderUrls(catId, urls);
    }
  }
}
