import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { ChromeExtentionUtilsService } from '../../core/utils/chrome-extention-utils.service';
import { PlayerService } from '../services/player.service';

@Component({
  selector: 'mmn-spy-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
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
