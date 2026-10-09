import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from '@ngx-translate/core';
import { SearchElement } from '../models/SearchElement';

@Component({
  selector: 'mmn-element',
  templateUrl: './element.component.html',
  styleUrls: ['./element.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, MatIconButton, MatIcon, TranslatePipe]
})
export class ElementComponent {
  @Input() element: SearchElement;
  @Input() index: number;
  @Output() delete: EventEmitter<number> = new EventEmitter<number>();

  removeElement() {
    this.delete.emit(this.index);
  }
}
