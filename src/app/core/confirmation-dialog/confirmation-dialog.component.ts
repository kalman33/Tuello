import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { ExtendedModule } from '@ngbracket/ngx-layout';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'mmn-confirm-dialog',
  templateUrl: './confirmation-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, ExtendedModule, MatIcon, TranslatePipe]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { message: string }
  ) {}

  onCancel(): void {
    this.dialogRef.close(false); // Retourne "false" si l'utilisateur annule
  }

  onConfirm(): void {
    this.dialogRef.close(true); // Retourne "true" si l'utilisateur confirme
  }
}
