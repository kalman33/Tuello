import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

export type ImportMode = 'add' | 'replace';

@Component({
    selector: 'mmn-import-dialog',
    templateUrl: './import-dialog.component.html',
    styleUrls: ['./import-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatDialogContent, MatButton, MatIcon, MatDialogActions, MatDialogClose, TranslatePipe]
})
export class ImportDialogComponent {
    constructor(public dialogRef: MatDialogRef<ImportDialogComponent>) {}

    selectAdd() {
        this.dialogRef.close('add' as ImportMode);
    }

    selectReplace() {
        this.dialogRef.close('replace' as ImportMode);
    }
}
