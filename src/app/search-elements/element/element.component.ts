import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from '@ngx-translate/core';
import { DEFAULT_SEARCH_COLOR, getDisplayModeLabelKeys, SearchElement } from '../models/SearchElement';

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
  @Output() colorChange: EventEmitter<{ index: number; color: string }> = new EventEmitter<{ index: number; color: string }>();

  get displayKeys(): string[] {
    return getDisplayModeLabelKeys(this.element.displayMode, this.element.type);
  }

  get color(): string {
    return this.element.color || DEFAULT_SEARCH_COLOR;
  }

  /** (change) plutôt que (input) : une seule sauvegarde à la fermeture du sélecteur */
  changeColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    if (color && color !== this.color) {
      this.colorChange.emit({ index: this.index, color });
    }
  }

  removeElement() {
    this.delete.emit(this.index);
  }
}
