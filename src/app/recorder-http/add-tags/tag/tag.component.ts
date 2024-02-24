import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TagElement } from '../../models/TagElement';

@Component({
  selector: 'mmn-tag',
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss']
})
export class TagComponent implements OnInit {
  @Input() element: TagElement;
  @Input() index: number;
  @Output() delete: EventEmitter<number> = new EventEmitter<number>();


  constructor(public dialog: MatDialog) {}

  ngOnInit() {}

  removeElement() {
    this.delete.emit(this.index);
  }

}
