import { Component } from '@angular/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import {TranslatePipe, TranslateDirective} from "@ngx-translate/core";
import { MatButton } from '@angular/material/button';
import { MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose } from '@angular/material/dialog';

@Component({
    selector: 'mmn-spy-record-dialog',
    templateUrl: './record-dialog.component.html',
    animations: [fadeInAnimation],
    imports: [
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatButton,
        MatDialogClose,
        TranslatePipe,
    ]
})
export class RecordDialogComponent  {

  constructor() {}

 
}
