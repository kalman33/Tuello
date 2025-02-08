import { NgClass, SlicePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatCell, MatCellDef, MatColumnDef, MatHeaderCell, MatHeaderCellDef, MatHeaderRow, MatHeaderRowDef, MatRow, MatRowDef, MatTable } from '@angular/material/table';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from "@ngx-translate/core";
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { ChromeExtentionUtilsService } from '../../core/utils/chrome-extention-utils.service';
import { PlayerService } from '../services/player.service';

@Component({
    selector: 'mmn-spy-results',
    templateUrl: './results.component.html',
    styleUrls: ['./results.component.scss'],
    imports: [
        FlexModule,
        NgClass,
        ExtendedModule,
        MatIconButton,
        MatIcon,
        MatTable,
        MatColumnDef,
        MatHeaderCellDef,
        MatHeaderCell,
        MatCellDef,
        MatCell,
        MatHeaderRowDef,
        MatHeaderRow,
        MatRowDef,
        MatRow,
        SlicePipe,
        TranslatePipe
    ]
})
export class ResultsComponent implements OnInit, OnDestroy {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  displayedColumns: string[];

  constructor(
    public playerService: PlayerService,
    public chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private router: Router
  ) {
    this.displayedColumns = ['id', 'comparisonImage', 'actualImage', 'misMatchPercentage', 'imageDataUrl'];
  }

  ngOnInit() {

  }

  /**
   * Retour sur le spy-http
   */
  back() {
    this.router.navigate(['/spy'], { skipLocationChange: true })
  }

  ngOnDestroy() {
  }
}
