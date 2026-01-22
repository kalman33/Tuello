import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'mmn-recorder-http-settings',
  templateUrl: './recorder-http-settings.component.html',
  styleUrls: ['./recorder-http-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatCheckbox, MatFormField, MatLabel, MatInput, MatDialogActions, MatButton, MatIcon, TranslatePipe]
})
export class RecorderHttpSettingsComponent {
  private cdr = inject(ChangeDetectorRef);

  filter: string;
  overwrite = true;
  dataloaded: boolean;

  constructor(public dialogRef: MatDialogRef<RecorderHttpSettingsComponent>) {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPFilter', 'tuelloHTTPOverWrite'], (results) => {
      this.dataloaded = true;
      this.filter = results['tuelloHTTPFilter'];
      this.overwrite = results['tuelloHTTPOverWrite'] === false ? false : true;
      this.cdr.detectChanges();
    });
  }

  annuler(): void {
    this.dialogRef.close();
  }

  valider(): void {
    chrome.storage.local.set({ tuelloHTTPFilter: this.filter });
    chrome.storage.local.set({ tuelloHTTPOverWrite: this.overwrite });

    this.dialogRef.close();
  }
}
