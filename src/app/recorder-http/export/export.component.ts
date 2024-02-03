import { Component, Inject, NgZone, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { saveAs } from 'file-saver';
import { formatDate } from 'src/app/core/utils/date-utils';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'mmn-export',
  templateUrl: './export.component.html',
  styleUrls: ['./export.component.scss'],
  animations: [fadeInAnimation]
})
export class ExportComponent implements OnInit {
  libFileName = 'Tuello-Lib-file.js';
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  constructor(
    private translate: TranslateService,
    private zone: NgZone,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<ExportComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit() {}

  save() {
    const value = formatDate(new Date());
    const txtBlob = new Blob([this.data], { type: 'text/plain;charset=utf-8' });
    saveAs(txtBlob, `tuello-http-${value}.json`);
    this.dialogRef.close();
  }

  saveAsLib() {
    const value = formatDate(new Date());
    const url = chrome.runtime.getURL('exportTuelloTemplate.js');
    fetch(url)
      .then((response) => {
        return response.text();
      })
      .then((txt) => {
        chrome.storage.local.get(['deepMockLevel'], (results) => {
          // on enregistre les donnes en json
          const value = formatDate(new Date());
          const jsonFileName = `tuello-mocks-data-${value}.json`;
          const txtBlobJson = new Blob([this.data], { type: 'text/plain;charset=utf-8' });
          saveAs(txtBlobJson, jsonFileName);

          let contentFile = txt.replace(/###IMPORT_TUELLO_FILE###/, jsonFileName);
          contentFile = contentFile.replace(/.###IMPORT_DEEPMOCKLEVEL###./, results['deepMockLevel'] || 0);
          this.libFileName = `tuello-mocks-library-${value}.js`;
          const txtBlob = new Blob([contentFile], { type: 'text/plain;charset=utf-8' });
          saveAs(txtBlob, this.libFileName);
          this.zone.run(() => {
            this.snackBar.open(
              this.translate.instant('mmn.recorder-http.export.saveAsLib.information.message'),
              this.translate.instant('mmn.spy-http.import.success.action'),
              { duration: 1000 }
            );
          });
        });
      });
  }
}
