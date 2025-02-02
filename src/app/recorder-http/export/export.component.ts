import { Component, Inject, NgZone, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose } from '@angular/material/dialog';
import { saveAs } from 'file-saver';
import { formatDate } from 'src/app/core/utils/date-utils';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService, TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { NgClass } from '@angular/common';

@Component({
    selector: 'mmn-export',
    templateUrl: './export.component.html',
    styleUrls: ['./export.component.scss'],
    animations: [fadeInAnimation],
    standalone: true,
    imports: [MatDialogTitle, MatDialogContent, NgClass, ExtendedModule, MatButton, MatIcon, MatDivider, MatDialogActions, MatDialogClose, TranslatePipe, TranslateDirective]
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
  ) { }

  ngOnInit() { }

  save() {
    const value = formatDate(new Date());
    const txtBlob = new Blob([ this.replaceDynamicData(this.data)], { type: 'text/plain;charset=utf-8' });
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
          //const value = formatDate(new Date());
          //const jsonFileName = `tuello-mocks-data-${value}.json`;
          //const txtBlobJson = new Blob([this.data], { type: 'text/plain;charset=utf-8' });
          //saveAs(txtBlobJson, jsonFileName);
          // Trouver l'index de la ligne où vous voulez insérer le commentaire
          let index = txt.indexOf('###IMPORT_DATA###');

          // Insérer le commentaire après cette ligne
          txt = txt.slice(0, index + 19) + " //#ENDOFJSON#: don't remove this comment\n" + txt.slice(index + 19);
          let contentFile = txt.replace(/.###IMPORT_DATA###./, this.data);
          //contentFile = contentFile.replace(/.###IMPORT_DEEPMOCKLEVEL###./, results['deepMockLevel'] || 0);
          this.libFileName = `tuello-mocks-library-${value}.js`;
          const txtBlob = new Blob([this.replaceDynamicData(contentFile)], { type: 'text/plain;charset=utf-8' });
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

  replaceDynamicData(data) {
    let dataTxt = data.replace(/'###window.location.origin###/, " window.location.origin + '");
    dataTxt = dataTxt.replace(/"###window.location.origin###/, ' window.location.origin + "');
    return dataTxt;
  }
}
