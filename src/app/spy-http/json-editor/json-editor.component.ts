import {AfterViewInit, Component, Inject, Input, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import {Action} from '../models/Action';

@Component({
  selector: 'mmn-json-editor',
  templateUrl: './json-editor.component.html',
  animations: [fadeInAnimation],
})
export class JsonEditorComponent implements OnInit {
  jsonAction: string;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<JsonEditorComponent>) {}

  ngOnInit() {
    this.jsonAction = JSON.stringify(this.data.action);
  }

  /**
   * fermeture de la popin
   */
  close() {
    this.dialogRef.close(JSON.parse(this.jsonAction));
  }

  cancel() {
    this.dialogRef.close();
  }
}
