import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

export interface AddUrlDialogData {
  url?: string;
  title?: string;
}

export interface AddUrlDialogResult {
  url: string;
  title: string;
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
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FormsModule, TranslatePipe]
})
export class AddUrlDialogComponent {
  private dialogRef = inject(MatDialogRef<AddUrlDialogComponent>);
  data: AddUrlDialogData = inject(MAT_DIALOG_DATA) ?? {};
  url = this.data.url ?? '';
  title = this.data.title ?? '';

  confirm() {
    if (this.url.trim() && this.title.trim()) {
      this.dialogRef.close({ url: this.url.trim(), title: this.title.trim() } as AddUrlDialogResult);
    }
  }
}
