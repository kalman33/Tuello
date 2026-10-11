import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { createZip } from '../../core/utils/zip';
import { Record } from '../models/Record';
import { isFolderWriteSupported, resolveFolder, savedFolderName, writeToFolder } from './folder-writer';
import { listStateEntries, StateEntry } from './initial-state-export';
import { analyzeRecord, ExportAnalysis, ExportMode, generatePlaywrightFiles, slugify } from './playwright-export';

export interface PlaywrightExportDialogData {
  record: Record;
  /** Nom proposé par défaut (scénario chargé, sinon vide) */
  name?: string;
}

/**
 * Export de l'enregistrement courant en test Playwright : contrôles, choix du mode, de
 * l'état initial restauré, puis téléchargement du zip ou écriture directe dans le dépôt.
 */
@Component({
  selector: 'mmn-playwright-export-dialog',
  template: `
    <h2 mat-dialog-title>{{ 'mmn.spy-http.playwright.title' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.spy-http.playwright.name' | translate }}</mat-label>
        <input matInput [(ngModel)]="name" cdkFocusInitial />
        <mat-hint>{{ 'mmn.spy-http.playwright.file' | translate: { file: fileName() } }}</mat-hint>
      </mat-form-field>

      <mat-radio-group class="modes" [(ngModel)]="mode">
        <mat-radio-button value="full">
          <strong>{{ 'mmn.spy-http.playwright.mode.full' | translate }}</strong>
          <span class="hint">{{ 'mmn.spy-http.playwright.mode.full.hint' | translate }}</span>
        </mat-radio-button>
        <mat-radio-button value="scenario">
          <strong>{{ 'mmn.spy-http.playwright.mode.scenario' | translate }}</strong>
          <span class="hint">{{ 'mmn.spy-http.playwright.mode.scenario.hint' | translate }}</span>
        </mat-radio-button>
      </mat-radio-group>

      @if (stateEntries.length > 0) {
        <mat-expansion-panel class="state-panel" [expanded]="hasSensitiveEntry()">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon class="panel-icon">key</mat-icon>
              {{ 'mmn.spy-http.playwright.state.title' | translate: { count: stateEntries.length } }}
            </mat-panel-title>
          </mat-expansion-panel-header>
          <p class="hint">{{ 'mmn.spy-http.playwright.state.hint' | translate }}</p>
          @for (entry of stateEntries; track entry.store + entry.key) {
            <div class="state-row">
              <span class="state-key" [matTooltip]="entry.value">
                @if (entry.sensitive) {
                  <mat-icon class="sensitive" [matTooltip]="'mmn.spy-http.playwright.state.sensitive' | translate">warning</mat-icon>
                }
                <span class="store">{{ 'mmn.spy-http.playwright.state.store.' + entry.store | translate }}</span>
                {{ entry.key }}
              </span>
              <mat-form-field class="state-mode" subscriptSizing="dynamic">
                <mat-select [(ngModel)]="entry.mode">
                  <mat-option value="keep">{{ 'mmn.spy-http.playwright.state.mode.keep' | translate }}</mat-option>
                  @if (entry.hasExpiringJwt) {
                    <mat-option value="extend">{{ 'mmn.spy-http.playwright.state.mode.extend' | translate }}</mat-option>
                  }
                  <mat-option value="env">{{ 'mmn.spy-http.playwright.state.mode.env' | translate: { name: entry.envName } }}</mat-option>
                  <mat-option value="exclude">{{ 'mmn.spy-http.playwright.state.mode.exclude' | translate }}</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          }
        </mat-expansion-panel>
      }

      @for (issue of analysis.blocking; track issue.code) {
        <p class="issue blocking">
          <mat-icon>block</mat-icon>
          <span>{{ 'mmn.spy-http.playwright.issue.' + issue.code | translate: issue }}</span>
        </p>
      }
      @for (issue of analysis.warnings; track issue.code) {
        <p class="issue warning">
          <mat-icon>{{ issue.code === 'no-test-start' || issue.code === 'no-assertion' ? 'lightbulb' : 'warning' }}</mat-icon>
          <span>{{ 'mmn.spy-http.playwright.issue.' + issue.code | translate: issue }}</span>
        </p>
      }
      @if (folderError) {
        <p class="issue blocking">
          <mat-icon>folder_off</mat-icon>
          <span>{{ folderError | translate }}</span>
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      @if (folderSupported) {
        <button mat-stroked-button [disabled]="!canExport() || writing" (click)="writeFolder(true)" [matTooltip]="'mmn.spy-http.playwright.folder.change' | translate">
          <mat-icon>create_new_folder</mat-icon>
        </button>
        <button mat-flat-button color="accent" [disabled]="!canExport() || writing" (click)="writeFolder(false)">
          <mat-icon>drive_folder_upload</mat-icon>
          {{ folderName ? ('mmn.spy-http.playwright.folder.write' | translate: { folder: folderName }) : ('mmn.spy-http.playwright.folder.choose' | translate) }}
        </button>
      }
      <button mat-flat-button color="accent" [disabled]="!canExport() || writing" (click)="download()">
        <mat-icon>download</mat-icon>
        {{ 'mmn.spy-http.playwright.zip' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    '.full-width { width: 100%; min-width: 360px; display: block; margin-bottom: 8px; }',
    '.modes { display: flex; flex-direction: column; gap: 4px; margin: 8px 0 12px; }',
    '.hint { display: block; font-size: 12px; opacity: 0.75; margin: 0 0 8px; }',
    '.state-panel { margin-bottom: 12px; }',
    '.panel-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; }',
    '.state-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }',
    '.state-key { display: flex; align-items: center; gap: 4px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.store { font-size: 11px; opacity: 0.6; }',
    '.sensitive { font-size: 16px; width: 16px; height: 16px; color: #e65100; flex-shrink: 0; }',
    '.state-mode { width: 210px; flex-shrink: 0; }',
    '.issue { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; margin: 4px 0; }',
    '.issue mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }',
    '.issue.blocking { color: #c62828; }',
    '.issue.warning { color: #e65100; }'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatRadioModule, MatSelectModule, MatExpansionModule, MatTooltipModule, FormsModule, TranslatePipe]
})
export class PlaywrightExportDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<PlaywrightExportDialogComponent>);
  private data: PlaywrightExportDialogData = inject(MAT_DIALOG_DATA);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  name = this.data.name ?? '';
  mode: ExportMode = 'full';
  analysis: ExportAnalysis = analyzeRecord(this.data.record);
  stateEntries: StateEntry[] = listStateEntries(this.data.record.initialState);

  folderSupported = isFolderWriteSupported();
  folderName: string | null = null;
  folderError: string | null = null;
  writing = false;

  ngOnInit() {
    // Hôtes locaux déclarés dans les Paramètres : l'analyse est refaite une fois connus
    chrome.storage.local.get(['playwrightLocalHosts'], (results: { [key: string]: unknown }) => {
      const hosts = Array.isArray(results['playwrightLocalHosts']) ? (results['playwrightLocalHosts'] as string[]) : [];
      this.analysis = analyzeRecord(this.data.record, hosts);
      this.cdr.detectChanges();
    });
    if (this.folderSupported) {
      savedFolderName().then((name) => {
        this.folderName = name;
        this.cdr.detectChanges();
      });
    }
  }

  fileName(): string {
    return `${slugify(this.name)}.spec.ts`;
  }

  hasSensitiveEntry(): boolean {
    return this.stateEntries.some((entry) => entry.sensitive);
  }

  canExport(): boolean {
    return !!this.name.trim() && this.analysis.blocking.length === 0;
  }

  private files() {
    return generatePlaywrightFiles(this.data.record, { testName: this.name.trim(), mode: this.mode, stateEntries: this.stateEntries });
  }

  download() {
    if (!this.canExport()) {
      return;
    }
    const suffix = this.mode === 'full' ? 'projet' : 'scenario';
    saveAs(createZip(this.files()), `tuello-playwright-${slugify(this.name)}-${suffix}.zip`);
    this.dialogRef.close(true);
  }

  /** Écrit directement dans le dépôt ; `chooseAgain` pour changer de dossier */
  async writeFolder(chooseAgain: boolean) {
    if (!this.canExport()) {
      return;
    }
    this.writing = true;
    this.folderError = null;
    this.cdr.detectChanges();
    try {
      const folder = await resolveFolder(chooseAgain);
      const result = await writeToFolder(folder, this.files());
      this.snackBar.open(this.translate.instant('mmn.spy-http.playwright.folder.done', { count: result.written.length, folder: result.folderName, kept: result.kept.length }), null, { duration: 4000 });
      this.dialogRef.close(true);
    } catch (error) {
      // Choix annulé par l'utilisateur : rien à signaler
      if ((error as DOMException)?.name !== 'AbortError') {
        console.warn('Tuello: écriture dans le dossier impossible', error);
        // Chrome refuse le sélecteur de dossier dans une page intégrée en iframe
        this.folderError = (error as DOMException)?.name === 'SecurityError' ? 'mmn.spy-http.playwright.folder.unavailable' : 'mmn.spy-http.playwright.folder.error';
      }
    } finally {
      this.writing = false;
      this.cdr.detectChanges();
    }
  }
}
