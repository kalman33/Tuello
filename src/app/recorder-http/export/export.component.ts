import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';
import {fadeInAnimation} from '../../core/animations/fadeInAnimation';
import { saveAs } from 'file-saver';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { formatDate } from 'src/app/core/utils/date-utils';

@Component({
  selector: 'mmn-export',
  templateUrl: './export.component.html',
  styleUrls: ['./export.component.scss'],
  animations: [fadeInAnimation],
})
export class ExportComponent implements OnInit {

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}

  ngOnInit() {}

  save() {
    const value = formatDate(new Date());
    const txtBlob = new Blob([this.data], { type: 'text/plain;charset=utf-8' });
    saveAs(txtBlob, `tuello-http-${value}.json`);
  }

  saveAsLib() {
    const value = formatDate(new Date());
    const url = chrome.runtime.getURL('exportTuelloTemplate.js');
    fetch(url)
    .then((response) => {
      return response.text();
    }) 
    .then((txt) => {
      chrome.storage.local.get(['deepMockLevel'], results => {
      
        let contentFile = txt.replace(/.###IMPORT_DATA###./, this.data);
        contentFile = contentFile.replace(/.###IMPORT_DEEPMOCKLEVEL###./, results['deepMockLevel'] || 0);
        const txtBlob = new Blob([contentFile], { type: 'text/plain;charset=utf-8' });
        saveAs(txtBlob, `tuello-mocks-${value}.js`);
      });
      
    });

  }
}
