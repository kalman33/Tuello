import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {Action} from '../models/Action';
import {JsonEditorComponent} from '../json-editor/json-editor.component';
import {ChromeExtentionUtilsService} from '../../core/utils/chrome-extention-utils.service';
import {TranslatePipe, TranslateDirective} from "@ngx-translate/core";
import { LowerCasePipe } from '@angular/common';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { FlexModule } from '@ngbracket/ngx-layout/flex';

@Component({
    selector: 'mmn-action',
    templateUrl: './action.component.html',
    styleUrls: ['./action.component.scss'],
    standalone: true,
    imports: [
        FlexModule,
        MatTooltip,
        MatIcon,
        MatIconButton,
        LowerCasePipe,
        TranslatePipe, TranslateDirective,
    ],
})
export class ActionComponent implements OnInit {
  @Input() action: Action;
  @Input() index: number;

  @Output() delete: EventEmitter<number> = new EventEmitter<number>();
  @Output() duplicate: EventEmitter<number> = new EventEmitter<number>();
  @Output() modify: EventEmitter<[number, Action]> = new EventEmitter<[number, Action]>();
  @Output() preview: EventEmitter<number> = new EventEmitter<number>();
  @Output() decreaseDelay: EventEmitter<number> = new EventEmitter<number>();


  constructor(public dialog: MatDialog, public chromeExtentionUtilsService: ChromeExtentionUtilsService) {}

  ngOnInit() {}

  deleteAction() {
    this.delete.emit(this.index);
  }

  duplicateAction() {
    this.duplicate.emit(this.index);
  }

  previewAction() {
    this.preview.emit(this.index);
  }

  reduceDelay() {
    this.decreaseDelay.emit(this.index);
  }

  openJsonEditor() {
    const dialogRef = this.dialog.open(JsonEditorComponent, {
      data: {
        action: this.action
      },
      maxWidth: '98vw',
      maxHeight: '90vh',
      height: '90%',
      width: '98%',
    });

    dialogRef.afterClosed().subscribe((jsonAction: Action) => {
      if (jsonAction) {
        this.action = jsonAction;
        this.modify.emit([this.index, jsonAction]);
      }
    });
  }

  getDomain(): string {
    const url = new URL(this.action?.userAction?.hrefLocation);
    return url.hostname;
  }


}
