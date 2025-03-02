import { NgClass } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import JSON5 from 'json5';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';

@Component({
    selector: 'mmn-json-formatter',
    templateUrl: './json-formatter.component.html',
    styleUrls: ['./json-formatter.component.scss'],
    imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatButton, MatIcon, MatTooltip, TranslatePipe]
})
export class JsonFormatterComponent  {

  private snackBar = inject(MatSnackBar);
  
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  constructor(
    private translate: TranslateService,
    public dialog: MatDialog,
    private ref: ChangeDetectorRef
  ) {
    
  }

  jsonInput: string = '';

  beautifyJson() {
    try {
      // Parse le JSON et le formate avec une indentation de 2 espaces
      const parsedJson = JSON5.parse(this.jsonInput);
      this.jsonInput = JSON.stringify(parsedJson, null, 2); // Beautify
    } catch (e) {
      this.snackBar.open(this.translate.instant('mmn.json-formatter.json.invalid'), '', {duration: 2000});
    }
  }

  /**
   * Permet de copier dans le presse-papier
   * Cette fonctionnalité sera rajouté dans le cdk en version 9.xs
   */
  copyToClipboard() {
    const el = document.createElement('textarea');
    try {
      el.value = this.jsonInput;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      this.snackBar.open(this.translate.instant('mmn.json-formatter.button.copied'), '', {duration: 1000});
    } catch (e) {
      // @TODO : a compléter
    }
  }

  cleanInputText() {
    this.jsonInput = '';
  }

}
