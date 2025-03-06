import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SearchElement } from '../models/SearchElement';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { FlexModule } from '@ngbracket/ngx-layout/flex';

@Component({
    selector: 'mmn-element',
    templateUrl: './element.component.html',
    styleUrls: ['./element.component.scss'],
    imports: [FlexModule, MatIconButton, MatIcon]
})
export class ElementComponent {
  @Input() element: SearchElement;
  @Input() index: number;
  @Output() delete: EventEmitter<number> = new EventEmitter<number>();


  constructor(public dialog: MatDialog) {}

  removeElement() {
    this.delete.emit(this.index);
  }

}
