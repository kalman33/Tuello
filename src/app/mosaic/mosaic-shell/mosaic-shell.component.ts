import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { CategoriesGridComponent } from '../categories-grid/categories-grid.component';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicToolbarComponent } from '../mosaic-toolbar/mosaic-toolbar.component';
import { MosaicStorageService } from '../services/mosaic-storage.service';
import { UrlsGridComponent } from '../urls-grid/urls-grid.component';

@Component({
  selector: 'mmn-mosaic-shell',
  templateUrl: './mosaic-shell.component.html',
  styleUrls: ['./mosaic-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MosaicToolbarComponent, CategoriesGridComponent, UrlsGridComponent, MatDialogModule, MatSnackBarModule]
})
export class MosaicShellComponent implements OnInit {
  selectedCategoryId = signal<string | null>(null);
  selectedCategory: MosaicCategory | null = null;
  categories: MosaicCategory[] = [];
  rootUrls: MosaicUrl[] = [];
  categoryUrls: MosaicUrl[] = [];

  private storageService = inject(MosaicStorageService);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    chrome.storage.local.get(['darkMode', 'language'], (result) => {
      if (result['darkMode']) {
        document.body.classList.remove('default-theme');
        document.body.classList.add('black-theme');
      }
      const lang = result['language'] ?? 'en';
      this.translate.use(lang);
    });

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
    this.cdr.detectChanges();
  }

  goBack() {
    this.selectedCategoryId.set(null);
    this.selectedCategory = null;
    this.categoryUrls = [];
    this.cdr.detectChanges();
  }

  async onGridReordered(event: { categories: MosaicCategory[]; rootUrls: MosaicUrl[] }): Promise<void> {
    await this.storageService.reorderGridItems(event.categories, event.rootUrls);
  }

  async onUrlsReordered(urls: MosaicUrl[]): Promise<void> {
    const catId = this.selectedCategoryId();
    if (catId) {
      await this.storageService.reorderUrls(catId, urls);
    }
  }
}
