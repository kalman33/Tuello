import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'mmn-element',
  templateUrl: './element.component.html',
  styleUrls: ['./element.component.scss']
})
export class ElementComponent implements OnInit {
  @Input() element: string;
  @Input() index: number;
  @Output() delete: EventEmitter<number> = new EventEmitter<number>();


  constructor(public dialog: MatDialog) {}

  ngOnInit() {}

  removeElement() {
    this.delete.emit(this.index);
  }

}
