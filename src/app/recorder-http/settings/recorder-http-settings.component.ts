import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { MatDialogRef, MatDialogTitle, MatDialogActions } from '@angular/material/dialog';
import {TranslatePipe, TranslateDirective} from "@ngx-translate/core";
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatInput } from '@angular/material/input';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { FlexModule } from '@ngbracket/ngx-layout/flex';


@Component({
    selector: 'mmn-recorder-http-settings',
    templateUrl: './recorder-http-settings.component.html',
    styleUrls: ['./recorder-http-settings.component.scss'],
    imports: [FlexModule, MatDialogTitle, MatCheckbox, FormsModule, MatFormField, MatLabel, MatInput, MatDialogActions, MatButton, MatIcon, TranslatePipe, TranslateDirective]
})
export class RecorderHttpSettingsComponent implements OnInit {

  filter: string;
  overwrite = true;
  dataloaded: boolean;


  constructor(
    public dialogRef: MatDialogRef<RecorderHttpSettingsComponent>,
  ) {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPFilter', 'tuelloHTTPOverWrite'], results => {
      this.dataloaded = true;
      this.filter = results['tuelloHTTPFilter'];
     
      this.overwrite = results['tuelloHTTPOverWrite'] === false ? false : true;
    });
   }


  ngOnInit() {
    
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