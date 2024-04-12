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
   }


  ngOnInit() {
    chrome.storage.local.get(['httpMock', 'httpRecord'], results => {
    });
  }
  annuler(): void {
    this.dialogRef.close();
  }

  valider(): void {
    alert(this.filter);
    alert(this.overwrite);
  }


}