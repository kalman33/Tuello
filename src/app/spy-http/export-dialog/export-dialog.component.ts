import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/** Destination choisie ; l'écran Enregistrement/Rejeu réalise l'export correspondant */
export type ExportChoice = 'report' | 'playwright' | 'scenario' | 'file';

interface ExportOption {
  choice: ExportChoice;
  icon: string;
}

/**
 * Regroupe les différentes façons de sortir un enregistrement de l'écran
 * Enregistrement/Rejeu derrière un seul bouton « Exporter ».
 */
@Component({
  selector: 'mmn-export-dialog',
  template: `
    <h2 mat-dialog-title>{{ 'mmn.spy-http.export.title' | translate }}</h2>
    <mat-dialog-content>
      <div class="options">
        @for (option of options; track option.choice) {
          <button type="button" class="option" (click)="choose(option.choice)">
            <mat-icon color="accent">{{ option.icon }}</mat-icon>
            <span class="text">
              <span class="label">{{ 'mmn.spy-http.export.' + option.choice | translate }}</span>
              <span class="hint">{{ 'mmn.spy-http.export.' + option.choice + '.hint' | translate }}</span>
            </span>
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    '.options { display: flex; flex-direction: column; gap: 8px; min-width: 340px; }',
    '.option { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
    '.option:hover, .option:focus-visible { background: rgba(128, 128, 128, 0.12); }',
    '.option mat-icon { flex-shrink: 0; }',
    '.text { display: flex; flex-direction: column; }',
    '.label { font-weight: 500; }',
    '.hint { font-size: 12px; opacity: 0.75; }'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe]
})
export class ExportDialogComponent {
  private dialogRef = inject(MatDialogRef<ExportDialogComponent, ExportChoice>);

  options: ExportOption[] = [
    { choice: 'report', icon: 'description' },
    { choice: 'playwright', icon: 'science' },
    { choice: 'scenario', icon: 'bookmark_add' },
    { choice: 'file', icon: 'save' }
  ];

  choose(choice: ExportChoice) {
    this.dialogRef.close(choice);
  }
}
