import {Component, Inject, OnInit} from '@angular/core';
import {MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA, MatLegacyDialogRef as MatDialogRef} from '@angular/material/legacy-dialog';
import {fadeInAnimation} from '../animations/fadeInAnimation';

@Component({
  selector: 'mmn-json-viewer',
  templateUrl: './json-viewer.component.html',
  animations: [fadeInAnimation],
})
export class JsonViewerComponent implements OnInit {

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<JsonViewerComponent>) {}

  ngOnInit() {}
}
