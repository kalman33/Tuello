import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'mmn-error-json',
  templateUrl: './error-json.component.html',
  styleUrls: ['./error-json.component.scss'],
  imports: [FlexModule, MatDialogModule, MatGridListModule, MatDividerModule, MatTooltip, MatButtonModule, ExtendedModule, MatIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorJsonComponent {

  constructor(
    private translate: TranslateService,
    public dialog: MatDialog,
    private infoBar: MatSnackBar,
    public dialogRef: MatDialogRef<ErrorJsonComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {line: number, column: number, lastEntry: string},
  ) {

  }

  onClose(): void {
    this.dialogRef.close(true); // Retourne "true" si l'utilisateur confirme
  }

    /**
   * Permet de copier dans le presse-papier
   * Cette fonctionnalité sera rajouté dans le cdk en version 9.xs
   */
    copyToClipboard() {
      const el = document.createElement('textarea');
      try {
        el.value = this.data.lastEntry
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        this.infoBar.open(this.translate.instant('mmn.error-json.button.copied'), '', {duration: 1000});
      } catch (e) {
        // @TODO : a compléter
      }
    }

}
