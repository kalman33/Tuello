import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogActions, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from "@ngx-translate/core";


@Component({
    selector: 'mmn-recorder-http-settings',
    templateUrl: './recorder-http-settings.component.html',
    styleUrls: ['./recorder-http-settings.component.scss'],
    imports: [FlexModule, FormsModule, MatDialogTitle, MatCheckbox, MatFormField, MatLabel, MatInput, MatDialogActions, MatButton, MatIcon, TranslatePipe]
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