import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnDestroy, Output } from '@angular/core';
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
export class MosaicToolbarComponent implements AfterViewInit, OnDestroy {
  @Input() showBack = false;
  @Input() categoryName = '';
  @Output() backClick = new EventEmitter<void>();

  tuelloTyped = false;
  tuelloDone = false;
  subtitleTyped = false;

  private cdr = inject(ChangeDetectorRef);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngAfterViewInit(): void {
    this.timers.push(
      setTimeout(() => {
        this.tuelloTyped = true;
        this.cdr.markForCheck();
      }, 50),
      setTimeout(() => {
        this.tuelloDone = true;
        this.cdr.markForCheck();
      }, 700),
      setTimeout(() => {
        this.subtitleTyped = true;
        this.cdr.markForCheck();
      }, 800)
    );
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }
}
