import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';


@Component({
  selector: 'mmn-recorder-http-settings',
  templateUrl: './recorder-http-settings.component.html',
  styleUrls: ['./recorder-http-settings.component.scss']
})
export class RecorderHttpSettingsComponent implements OnInit {

  filter: string;
  overwrite: boolean;


  constructor(
    public dialogRef: MatDialogRef<RecorderHttpSettingsComponent>,
  ) {
    // recupération des elements
    chrome.storage.local.get(['tuelloHTTPFilter', 'tuelloHTTPOverWrite'], results => {
      this.filter = results['tuelloHTTPFilter'];
      this.overwrite = results['tuelloHTTPOverWrite'] || true;
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
  }


}