import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomHeader } from '../models/http.return';

@Component({
  selector: 'mmn-recorder-http-settings',
  templateUrl: './recorder-http-settings.component.html',
  styleUrls: ['./recorder-http-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, FormsModule, MatDialogTitle, MatDialogContent, MatCheckbox, MatFormField, MatLabel, MatInput, MatDialogActions, MatButton, MatIconButton, MatIcon, TranslatePipe]
})
export class RecorderHttpSettingsComponent {
  private cdr = inject(ChangeDetectorRef);

  filter: string;
  overwrite = true;
  dataloaded: boolean;
  customHeaders: CustomHeader[] = [];

  constructor(public dialogRef: MatDialogRef<RecorderHttpSettingsComponent>) {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPFilter', 'tuelloHTTPOverWrite', 'tuelloHTTPCustomHeaders'], (results) => {
      this.dataloaded = true;
      this.filter = results['tuelloHTTPFilter'];
      this.overwrite = results['tuelloHTTPOverWrite'] === false ? false : true;
      this.customHeaders = results['tuelloHTTPCustomHeaders'] || [];
      this.cdr.detectChanges();
    });
  }

  addHeader(): void {
    this.customHeaders.push({ name: '', value: '' });
  }

  removeHeader(index: number): void {
    this.customHeaders.splice(index, 1);
  }

  annuler(): void {
    this.dialogRef.close();
  }

  valider(): void {
    // Filtrer les headers vides
    const validHeaders = this.customHeaders.filter((h) => h.name.trim() !== '');

    chrome.storage.local.set({ tuelloHTTPFilter: this.filter });
    chrome.storage.local.set({ tuelloHTTPOverWrite: this.overwrite });
    chrome.storage.local.set({ tuelloHTTPCustomHeaders: validHeaders });

    this.dialogRef.close();
  }
}
