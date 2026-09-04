import { ChangeDetectionStrategy, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { MosaicImportResult } from '../models/mosaic.models';
import { MosaicStorageService } from '../services/mosaic-storage.service';

@Component({
  selector: 'mmn-import-export-dialog',
  template: `
    <h2 mat-dialog-title>{{ 'mmn.mosaic.importexport.title' | translate }}</h2>
    <mat-dialog-content>
      <mat-tab-group>
        <mat-tab [label]="'mmn.mosaic.export.tab' | translate">
          <div style="padding: 16px 0;">
            <button mat-flat-button color="accent" (click)="export()">
              <mat-icon>download</mat-icon>
              {{ 'mmn.mosaic.export.button' | translate }}
            </button>
          </div>
        </mat-tab>
        <mat-tab [label]="'mmn.mosaic.import.tab' | translate">
          <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px;">
            <button mat-flat-button color="accent" (click)="fileInput.click()">
              <mat-icon>upload</mat-icon>
              {{ 'mmn.mosaic.import.button' | translate }}
            </button>
            <input #fileInput type="file" accept=".json" style="display:none" (change)="onFileChange($event)" />
          </div>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.close' | translate }}</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTabsModule, FormsModule, TranslatePipe]
})
export class ImportExportDialogComponent {
  @ViewChild('fileInput') fileInput: ElementRef;

  private dialogRef = inject(MatDialogRef<ImportExportDialogComponent>);
  private storageService = inject(MosaicStorageService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  async export() {
    // L'export embarque les scénarios associés aux sites exportés
    const json = await this.storageService.exportConfig();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const date = new Date().toISOString().slice(0, 10);
    saveAs(blob, `mosaic-config-${date}.json`);
  }

  /** Message d'import : on signale les scénarios ajoutés et les associations perdues */
  private importMessage(result: MosaicImportResult): string {
    const messages = [this.translate.instant('mmn.mosaic.import.success')];
    if (result.importedScenarios > 0) {
      messages.push(this.translate.instant('mmn.mosaic.import.scenarios', { count: result.importedScenarios }));
    }
    if (result.droppedReferences > 0) {
      messages.push(this.translate.instant('mmn.mosaic.import.scenarios.missing', { count: result.droppedReferences }));
    }
    return messages.join(' ');
  }

  onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await this.storageService.importConfig(reader.result as string);
        this.snackBar.open(this.importMessage(result), '', { duration: 3000 });
        this.dialogRef.close(true);
      } catch {
        this.snackBar.open(this.translate.instant('mmn.mosaic.import.error'), '', { duration: 2000 });
      }
    };
    reader.readAsText(file);
  }
}
