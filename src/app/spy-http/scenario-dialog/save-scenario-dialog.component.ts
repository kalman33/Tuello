import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

export interface SaveScenarioDialogData {
  /** Nom initial (renommage) */
  name?: string;
  /** Noms déjà utilisés, pour prévenir de l'écrasement */
  existingNames: string[];
  /** true pour un renommage : le libellé et l'avertissement changent */
  rename?: boolean;
}

@Component({
  selector: 'mmn-save-scenario-dialog',
  template: `
    <h2 mat-dialog-title>{{ (data.rename ? 'mmn.spy-http.scenario.rename' : 'mmn.spy-http.scenario.save') | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.spy-http.scenario.name' | translate }}</mat-label>
        <input matInput [(ngModel)]="name" (keyup.enter)="confirm()" cdkFocusInitial />
      </mat-form-field>
      @if (isOverwrite()) {
        <p class="warning">
          <mat-icon>warning</mat-icon>
          {{ 'mmn.spy-http.scenario.exists' | translate }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      <button mat-flat-button color="accent" [disabled]="!name.trim()" (click)="confirm()">
        {{ 'mmn.mosaic.dialog.confirm' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    '.full-width { width: 100%; min-width: 320px; display: block; }',
    '.warning { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 0; color: #e65100; }',
    '.warning mat-icon { font-size: 18px; width: 18px; height: 18px; }'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, FormsModule, TranslatePipe]
})
export class SaveScenarioDialogComponent {
  private dialogRef = inject(MatDialogRef<SaveScenarioDialogComponent>);
  data: SaveScenarioDialogData = inject(MAT_DIALOG_DATA) ?? { existingNames: [] };
  name = this.data.name ?? '';

  isOverwrite(): boolean {
    const trimmed = this.name.trim();
    return !!trimmed && trimmed !== this.data.name && (this.data.existingNames ?? []).includes(trimmed);
  }

  confirm() {
    if (this.name.trim()) {
      this.dialogRef.close(this.name.trim());
    }
  }
}
