import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';

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
