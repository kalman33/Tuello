import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { ReportMetadata } from '../services/html-report.service';

/**
 * Demande, avant génération du rapport, deux informations facultatives (utilisateur de test,
 * commentaire libre) qui seront affichées en tête du rapport HTML, avant les actions
 * enregistrées. Annuler (sans résultat) abandonne la génération du rapport.
 */
@Component({
  selector: 'mmn-report-metadata-dialog',
  template: `
    <h2 mat-dialog-title>{{ 'mmn.report.metadataDialog.title' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.report.metadataDialog.user' | translate }}</mat-label>
        <input matInput [(ngModel)]="user" autofocus />
      </mat-form-field>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.report.metadataDialog.comment' | translate }}</mat-label>
        <textarea matInput rows="3" [(ngModel)]="comment"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.report.metadataDialog.cancel' | translate }}</button>
      <button mat-flat-button color="primary" (click)="confirm()">{{ 'mmn.report.metadataDialog.confirm' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: ['.full-width { width: 100%; min-width: 320px; display: block; margin-bottom: 8px; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class ReportMetadataDialogComponent {
  private dialogRef = inject(MatDialogRef<ReportMetadataDialogComponent>);

  user = '';
  comment = '';

  confirm(): void {
    this.dialogRef.close({
      user: this.user.trim() || undefined,
      comment: this.comment.trim() || undefined
    } as ReportMetadata);
  }
}
