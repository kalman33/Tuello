import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, inject, Input, OnDestroy, Output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MosaicViewMode } from '../models/mosaic.models';

@Component({
  selector: 'mmn-mosaic-toolbar',
  templateUrl: './mosaic-toolbar.component.html',
  styleUrls: ['./mosaic-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe, FormsModule]
})
export class MosaicToolbarComponent implements AfterViewInit, OnDestroy {
  @Input() showBack = false;
  @Input() categoryName = '';
  @Input() viewMode: MosaicViewMode = 'grid';
  @Input() editMode = false;
  @Output() backClick = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() viewModeChange = new EventEmitter<MosaicViewMode>();
  @Output() editModeChange = new EventEmitter<boolean>();
  @Output() addUrl = new EventEmitter<void>();
  @Output() addCategory = new EventEmitter<void>();

  tuelloTyped = false;
  tuelloDone = false;
  subtitleTyped = false;

  searchQuery = '';
  searchFocused = signal(false);

  searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private cdr = inject(ChangeDetectorRef);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngAfterViewInit(): void {
    this.focusSearch();
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

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.searchChange.emit(value);
  }

  onViewModeChange(mode: MosaicViewMode): void {
    if (mode && mode !== this.viewMode) {
      this.viewModeChange.emit(mode);
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
    this.focusSearch();
  }

  private focusSearch(): void {
    this.timers.push(
      setTimeout(() => {
        this.searchInput()?.nativeElement.focus();
      }, 0)
    );
  }
}
