import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { ReportMetadata } from '../services/html-report.service';

/** Clé de stockage de l'historique des utilisateurs saisis (voir `saveUserToHistory`), même
 * logique de persistance que `reportHighlightSource`/`reportHighlightKey` dans `ReportComponent`. */
const USER_HISTORY_STORAGE_KEY = 'reportUserHistory';
const USER_HISTORY_MAX_SIZE = 20;

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
        <input matInput [(ngModel)]="user" (ngModelChange)="onUserChange($event)" [matAutocomplete]="userAutocomplete" autofocus />
        <mat-autocomplete #userAutocomplete="matAutocomplete">
          @for (suggestion of filteredUserHistory; track suggestion) {
            <mat-option [value]="suggestion">{{ suggestion }}</mat-option>
          }
        </mat-autocomplete>
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
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class ReportMetadataDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ReportMetadataDialogComponent>);
  private changeDetectorRef = inject(ChangeDetectorRef);

  user = '';
  comment = '';

  /** Utilisateurs déjà saisis lors de générations précédentes (le plus récent en tête), proposés
   * en autocomplétion pour éviter de ressaisir le même nom à chaque rapport. */
  private userHistory: string[] = [];
  filteredUserHistory: string[] = [];

  ngOnInit(): void {
    chrome.storage.local.get([USER_HISTORY_STORAGE_KEY], (results) => {
      this.userHistory = (results[USER_HISTORY_STORAGE_KEY] as string[]) || [];
      this.filteredUserHistory = this.userHistory;
      this.changeDetectorRef.detectChanges();
    });
  }

  onUserChange(value: string): void {
    const normalized = value.trim().toLowerCase();
    this.filteredUserHistory = normalized ? this.userHistory.filter((candidate) => candidate.toLowerCase().includes(normalized)) : this.userHistory;
  }

  confirm(): void {
    const user = this.user.trim();
    if (user) {
      this.saveUserToHistory(user);
    }
    this.dialogRef.close({
      user: user || undefined,
      comment: this.comment.trim() || undefined
    } as ReportMetadata);
  }

  /** Insensible à la casse pour éviter les doublons ("Jean"/"jean"), plafonné pour ne pas
   * accumuler indéfiniment, le plus récent toujours en tête de liste. */
  private saveUserToHistory(user: string): void {
    const withoutDuplicate = this.userHistory.filter((candidate) => candidate.toLowerCase() !== user.toLowerCase());
    const updated = [user, ...withoutDuplicate].slice(0, USER_HISTORY_MAX_SIZE);
    chrome.storage.local.set({ [USER_HISTORY_STORAGE_KEY]: updated });
  }
}
