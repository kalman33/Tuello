import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { take } from 'rxjs';
import { AddCategoryDialogComponent } from '../mosaic/dialogs/add-category-dialog.component';
import { AddUrlDialogComponent, AddUrlDialogResult } from '../mosaic/dialogs/add-url-dialog.component';
import { ImportExportDialogComponent } from '../mosaic/dialogs/import-export-dialog.component';
import { MosaicCategory, MosaicUrl } from '../mosaic/models/mosaic.models';
import { MosaicStorageService } from '../mosaic/services/mosaic-storage.service';

@Component({
  selector: 'mmn-mosaic-manager',
  templateUrl: './mosaic-manager.component.html',
  styleUrls: ['./mosaic-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MatDividerModule, MatListModule, MatMenuModule, MatAccordion, MatExpansionPanel, MatExpansionPanelHeader, MatExpansionPanelTitle, MatSlideToggleModule, FormsModule, TranslatePipe]
})
export class MosaicManagerComponent implements OnInit {
  categories: MosaicCategory[] = [];
  rootUrls: MosaicUrl[] = [];
  openOnStartup = false;

  private storageService = inject(MosaicStorageService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    this.storageService.loadConfig().then((config) => {
      this.openOnStartup = config.openOnStartup;
      this.cdr.detectChanges();
    });

    this.storageService.config$.subscribe((config) => {
      this.categories = [...config.categories].sort((a, b) => a.order - b.order);
      this.rootUrls = [...(config.urls ?? [])].sort((a, b) => a.order - b.order);
      this.cdr.detectChanges();
    });
  }

  toggleStartup(value: boolean) {
    this.openOnStartup = value;
    this.storageService.toggleOpenOnStartup(value);
  }

  openMosaic() {
    chrome.tabs.create({ url: chrome.runtime.getURL('mosaic/mosaic.html') });
  }

  openImportExport() {
    this.dialog.open(ImportExportDialogComponent).afterClosed().pipe(take(1)).subscribe();
  }

  addCategory() {
    this.dialog
      .open(AddCategoryDialogComponent, { data: {} })
      .afterClosed()
      .pipe(take(1))
      .subscribe((name: string) => {
        if (name) this.storageService.addCategory(name);
      });
  }

  editCategory(category: MosaicCategory) {
    this.dialog
      .open(AddCategoryDialogComponent, { data: { name: category.name } })
      .afterClosed()
      .pipe(take(1))
      .subscribe((name: string) => {
        if (name) this.storageService.updateCategory({ ...category, name });
      });
  }

  deleteCategory(categoryId: string) {
    this.storageService.deleteCategory(categoryId);
  }

  addUrlToCategory(categoryId: string) {
    this.dialog
      .open(AddUrlDialogComponent, { data: {} })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result: AddUrlDialogResult) => {
        if (result) this.storageService.addUrl(categoryId, result.url, result.title);
      });
  }

  editCategoryUrl(categoryId: string, url: MosaicUrl) {
    this.dialog
      .open(AddUrlDialogComponent, { data: { url: url.url, title: url.title } })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result: AddUrlDialogResult) => {
        if (result) this.storageService.updateUrl(categoryId, { ...url, url: result.url, title: result.title });
      });
  }

  deleteCategoryUrl(categoryId: string, urlId: string) {
    this.storageService.deleteUrl(categoryId, urlId);
  }

  addRootUrl() {
    this.dialog
      .open(AddUrlDialogComponent, { data: {} })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result: AddUrlDialogResult) => {
        if (result) this.storageService.addRootUrl(result.url, result.title);
      });
  }

  editRootUrl(url: MosaicUrl) {
    this.dialog
      .open(AddUrlDialogComponent, { data: { url: url.url, title: url.title } })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result: AddUrlDialogResult) => {
        if (result) this.storageService.updateRootUrl({ ...url, url: result.url, title: result.title });
      });
  }

  deleteRootUrl(urlId: string) {
    this.storageService.deleteRootUrl(urlId);
  }
}
