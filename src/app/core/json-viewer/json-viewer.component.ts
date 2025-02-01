import {Component, Inject, OnInit} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose } from '@angular/material/dialog';
import {fadeInAnimation} from '../animations/fadeInAnimation';
import { TranslateModule } from '@ngx-translate/core';
import { MatButton } from '@angular/material/button';
import { NgxJsonViewerModule } from 'ngx-json-viewer';

@Component({
    selector: 'mmn-json-viewer',
    templateUrl: './json-viewer.component.html',
    animations: [fadeInAnimation],
    standalone: true,
    imports: [
        MatDialogTitle,
        MatDialogContent,
        NgxJsonViewerModule,
        MatDialogActions,
        MatButton,
        MatDialogClose,
        TranslateModule,
    ],
})
export class JsonViewerComponent implements OnInit {

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public dialogRef: MatDialogRef<JsonViewerComponent>) {}

  ngOnInit() {}
}
