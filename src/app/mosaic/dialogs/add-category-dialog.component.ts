import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

export interface AddCategoryDialogData {
  name?: string;
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
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'mmn.mosaic.dialog.cancel' | translate }}</button>
      <button mat-flat-button color="accent" [disabled]="!name.trim()" (click)="confirm()">
        {{ 'mmn.mosaic.dialog.confirm' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.full-width { width: 100%; min-width: 280px; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class AddCategoryDialogComponent {
  private dialogRef = inject(MatDialogRef<AddCategoryDialogComponent>);
  data: AddCategoryDialogData = inject(MAT_DIALOG_DATA) ?? {};
  name = this.data.name ?? '';

  confirm() {
    if (this.name.trim()) {
      this.dialogRef.close(this.name.trim());
    }
  }
}
