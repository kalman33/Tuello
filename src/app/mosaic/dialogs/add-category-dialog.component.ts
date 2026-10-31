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
import { MosaicUrl } from '../models/mosaic.models';

export interface AddCategoryDialogData {
  name?: string;
  /** Sites de la catégorie modifiée : le choix d'un scénario ne s'affiche que s'il y en a */
  urls?: MosaicUrl[];
}

/** Valeur du sélecteur signifiant « laisser les scénarios des sites tels quels » */
const KEEP_SCENARIOS = '__keep__';

export interface AddCategoryDialogResult {
  name: string;
  /**
   * Scénario à appliquer à tous les sites de la catégorie : un id, `null` pour retirer
   * toute association, `undefined` pour ne rien changer.
   */
  scenarioId?: string | null;
}

@Component({
  selector: 'mmn-add-category-dialog',
  template: `
    <h2 mat-dialog-title>{{ (data.name ? 'mmn.mosaic.category.edit' : 'mmn.mosaic.category.add') | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field class="full-width">
        <mat-label>{{ 'mmn.mosaic.category.name' | translate }}</mat-label>
        <input matInput [(ngModel)]="name" (keyup.enter)="confirm()" autofocus />
      </mat-form-field>
      @if (urlCount > 0) {
        <mat-form-field class="full-width">
          <mat-label>{{ 'mmn.mosaic.category.scenario' | translate }}</mat-label>
          <mat-select [(ngModel)]="scenarioChoice">
            <mat-option [value]="keepValue">{{ 'mmn.mosaic.category.scenario.keep' | translate }}</mat-option>
            <mat-option [value]="null">{{ 'mmn.mosaic.url.scenario.none' | translate }}</mat-option>
            @for (scenario of scenarios; track scenario.id) {
              <mat-option [value]="scenario.id">{{ scenario.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ 'mmn.mosaic.category.scenario.hint' | translate: { count: urlCount } }}</mat-hint>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      <button mat-flat-button color="accent" [disabled]="!name.trim()" (click)="confirm()">
        {{ 'mmn.mosaic.dialog.confirm' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.full-width { width: 100%; min-width: 320px; display: block; margin-bottom: 8px; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class AddCategoryDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<AddCategoryDialogComponent>);
  private scenarioStorageService = inject(ScenarioStorageService);
  private cdr = inject(ChangeDetectorRef);

  data: AddCategoryDialogData = inject(MAT_DIALOG_DATA) ?? {};
  name = this.data.name ?? '';
  readonly keepValue = KEEP_SCENARIOS;
  readonly urlCount = this.data.urls?.length ?? 0;
  private readonly initialChoice = this.initialScenarioChoice();
  scenarioChoice: string | null = this.initialChoice;
  scenarios: Scenario[] = [];

  ngOnInit() {
    if (this.urlCount > 0) {
      this.scenarioStorageService.load().then((scenarios) => {
        this.scenarios = scenarios;
        this.cdr.detectChanges();
      });
    }
  }

  /** Si tous les sites partagent déjà le même scénario, il est présélectionné */
  private initialScenarioChoice(): string | null {
    const ids = new Set((this.data.urls ?? []).map((u) => u.scenarioId ?? null));
    return ids.size === 1 ? [...ids][0] : KEEP_SCENARIOS;
  }

  confirm() {
    const name = this.name.trim();
    if (!name) {
      return;
    }
    const result: AddCategoryDialogResult = { name };
    // Valeur présélectionnée inchangée : les sites ont déjà ce scénario, rien à écrire
    if (this.urlCount > 0 && this.scenarioChoice !== KEEP_SCENARIOS && this.scenarioChoice !== this.initialChoice) {
      result.scenarioId = this.scenarioChoice;
    }
    this.dialogRef.close(result);
  }
}
