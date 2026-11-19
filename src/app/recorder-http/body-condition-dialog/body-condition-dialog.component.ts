import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { bodyConditionKey, bodyMatchWeight } from 'chrome/src/utils/bodyMatch';
import JSON5 from 'json5';

export type BodyConditionDialogMode = 'duplicate' | 'edit';

export interface BodyConditionDialogData {
  mode: BodyConditionDialogMode;
  key: string;
  method?: string;
  // Condition actuelle du mock (pré-remplie dans le champ)
  condition?: unknown;
  // Clés (bodyConditionKey) des conditions déjà portées par les autres mocks de même
  // URL + méthode : en saisir une identique créerait un doublon jamais servi
  existingConditionKeys: string[];
}

/** `condition` : nouvelle condition ; `null` : supprimer la condition (mode edit uniquement) */
export interface BodyConditionDialogResult {
  condition: unknown | null;
}

type ConditionError = 'invalidJson' | 'notObject' | 'empty' | 'alreadyExists';

/**
 * Saisie de la condition sur le body d'un mock (`bodyMatch`) : JSON partiel que le body de
 * la requête doit contenir. JSON5 accepté (clés sans guillemets, quotes simples, virgule
 * finale), comme ailleurs dans l'écran des mocks.
 */
@Component({
  selector: 'mmn-body-condition-dialog',
  templateUrl: './body-condition-dialog.component.html',
  styleUrls: ['./body-condition-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatFormField, MatLabel, MatHint, MatError, MatInput, FormsModule, TranslatePipe]
})
export class BodyConditionDialogComponent {
  text: string;
  error: ConditionError | null = null;
  private parsed: unknown;

  readonly example = '{ "client": { "type": "PRO" } }';

  constructor(
    public dialogRef: MatDialogRef<BodyConditionDialogComponent, BodyConditionDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: BodyConditionDialogData,
    private ref: ChangeDetectorRef
  ) {
    this.text = bodyMatchWeight(data.condition) > 0 ? JSON.stringify(data.condition, null, 2) : '';
    this.validate();
    // Pas d'erreur affichée sur un champ encore vierge
    if (!this.text) this.error = null;
  }

  get hasCurrentCondition(): boolean {
    return this.data.mode === 'edit' && bodyMatchWeight(this.data.condition) > 0;
  }

  get canSubmit(): boolean {
    return !this.error && this.parsed !== undefined;
  }

  onTextChange(value: string) {
    this.text = value;
    this.validate();
    this.ref.markForCheck();
  }

  private validate() {
    this.parsed = undefined;
    const trimmed = this.text.trim();
    if (!trimmed) {
      this.error = 'empty';
      return;
    }
    let value: unknown;
    try {
      value = JSON5.parse(trimmed);
    } catch {
      this.error = 'invalidJson';
      return;
    }
    // Une condition porte sur des champs du body : objet (cas courant) ou tableau
    if (typeof value !== 'object' || value === null) {
      this.error = 'notObject';
      return;
    }
    if (bodyMatchWeight(value) === 0) {
      this.error = 'empty';
      return;
    }
    if (this.data.existingConditionKeys.includes(bodyConditionKey(value))) {
      this.error = 'alreadyExists';
      return;
    }
    this.error = null;
    this.parsed = value;
  }

  submit() {
    if (!this.canSubmit) return;
    this.dialogRef.close({ condition: this.parsed });
  }

  removeCondition() {
    this.dialogRef.close({ condition: null });
  }
}
