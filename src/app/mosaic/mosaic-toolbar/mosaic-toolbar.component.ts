import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'mmn-mosaic-toolbar',
  templateUrl: './mosaic-toolbar.component.html',
  styleUrls: ['./mosaic-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe]
})
export class MosaicToolbarComponent {
  @Input() showBack = false;
  @Input() categoryName = '';
  @Output() backClick = new EventEmitter<void>();
}
