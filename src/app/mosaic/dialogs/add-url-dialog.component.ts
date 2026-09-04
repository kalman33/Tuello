import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { Scenario } from '../../core/scenarios/scenario.models';
import { ScenarioStorageService } from '../../core/scenarios/scenario-storage.service';

export interface AddUrlDialogData {
  url?: string;
  title?: string;
  scenarioId?: string;
}

export interface AddUrlDialogResult {
  url: string;
  title: string;
  /** undefined = aucun scénario associé */
  scenarioId?: string;
}

@Component({
  selector: 'mmn-add-url-dialog',
  template: `
    <h2 mat-dialog-title>{{ (data.url ? 'mmn.mosaic.url.edit' : 'mmn.mosaic.url.add') | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.mosaic.url.label' | translate }}</mat-label>
        <input matInput [(ngModel)]="url" placeholder="https://" autofocus />
      </mat-form-field>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.mosaic.url.title' | translate }}</mat-label>
        <input matInput [(ngModel)]="title" (keyup.enter)="confirm()" />
      </mat-form-field>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.mosaic.url.scenario' | translate }}</mat-label>
        <mat-select [(ngModel)]="scenarioId">
          <mat-option [value]="null">{{ 'mmn.mosaic.url.scenario.none' | translate }}</mat-option>
          @for (scenario of scenarios; track scenario.id) {
            <mat-option [value]="scenario.id">{{ scenario.name }}</mat-option>
          }
        </mat-select>
        <mat-hint>{{ 'mmn.mosaic.url.scenario.hint' | translate }}</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      <button mat-flat-button color="accent" [disabled]="!url.trim() || !title.trim()" (click)="confirm()">
        {{ 'mmn.mosaic.dialog.confirm' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.full-width { width: 100%; min-width: 320px; display: block; margin-bottom: 8px; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class AddUrlDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<AddUrlDialogComponent>);
  private scenarioStorageService = inject(ScenarioStorageService);
  private cdr = inject(ChangeDetectorRef);

  data: AddUrlDialogData = inject(MAT_DIALOG_DATA) ?? {};
  url = this.data.url ?? '';
  title = this.data.title ?? '';
  scenarioId: string | null = this.data.scenarioId ?? null;
  scenarios: Scenario[] = [];

  ngOnInit() {
    this.scenarioStorageService.load().then((scenarios) => {
      this.scenarios = scenarios;
      this.cdr.detectChanges();
    });
  }

  confirm() {
    if (this.url.trim() && this.title.trim()) {
      this.dialogRef.close({
        url: this.url.trim(),
        title: this.title.trim(),
        scenarioId: this.scenarioId ?? undefined
      } as AddUrlDialogResult);
    }
  }
}
