import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { CompressionService } from '../../core/compression/compression.service';
import { groupStorageKeys, STORAGE_CATEGORIES, StorageCategory, StorageCategoryId } from './storage-categories';

export interface StorageTransferDialogData {
  mode: 'export' | 'import';
  /** Contenu à exporter (stockage courant) ou à importer (fichier lu) */
  data: Record<string, unknown>;
}

interface CategoryRow {
  category: StorageCategory;
  keyCount: number;
  size: string;
  checked: boolean;
}

/**
 * Choix des catégories (configuration, bouchons, scénarios, mosaïque...) à sauvegarder ou à importer.
 * Ferme avec la liste des catégories cochées, ou undefined si annulé.
 */
@Component({
  selector: 'mmn-storage-transfer-dialog',
  templateUrl: './storage-transfer-dialog.component.html',
  styleUrls: ['./storage-transfer-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckbox, MatIcon, TranslatePipe]
})
export class StorageTransferDialogComponent {
  readonly dialogData: StorageTransferDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<StorageTransferDialogComponent, StorageCategoryId[]>);
  private compressionService = inject(CompressionService);

  rows: CategoryRow[];

  constructor() {
    const groups = groupStorageKeys(this.dialogData.data);
    // Seules les catégories présentes sont proposées : à l'import, celles du fichier
    this.rows = STORAGE_CATEGORIES.filter((category) => groups.has(category.id)).map((category) => {
      const keys = groups.get(category.id);
      const bytes = keys.reduce((total, key) => total + new Blob([JSON.stringify(this.dialogData.data[key])]).size, 0);
      return { category, keyCount: keys.length, size: this.compressionService.formatSize(bytes), checked: category.checkedByDefault };
    });
  }

  get allChecked(): boolean {
    return this.rows.every((row) => row.checked);
  }

  get someChecked(): boolean {
    return this.rows.some((row) => row.checked);
  }

  toggleAll(checked: boolean) {
    this.rows.forEach((row) => (row.checked = checked));
  }

  onCancel() {
    this.dialogRef.close();
  }

  onConfirm() {
    this.dialogRef.close(this.rows.filter((row) => row.checked).map((row) => row.category.id));
  }
}
