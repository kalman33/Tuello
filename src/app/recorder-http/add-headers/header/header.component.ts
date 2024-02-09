import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HeaderElement } from '../../models/HeaderElement';

@Component({
  selector: 'mmn-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  @Input() element: HeaderElement;
  @Input() index: number;
  @Output() delete: EventEmitter<number> = new EventEmitter<number>();


  constructor(public dialog: MatDialog) {}

  ngOnInit() {}

  removeElement() {
    this.delete.emit(this.index);
  }

}
