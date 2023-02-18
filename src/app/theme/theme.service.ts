import { Injectable } from '@angular/core';
import {OverlayContainer} from '@angular/cdk/overlay';

/**
 * Permet de stocker les flux json de tous les services
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {

  constructor(private overlay: OverlayContainer) {
  }

  /**
   * Permet de switch de theme
   */
  toggleTheme(darkModevalue: boolean): void {

    if (darkModevalue !== document.body.classList.contains('black-theme')) {
      if (this.overlay.getContainerElement().classList.contains('black-theme')) {
        this.overlay.getContainerElement().classList.remove('black-theme');
        this.overlay.getContainerElement().classList.add('default-theme');
      } else if (this.overlay.getContainerElement().classList.contains('default-theme')) {
        this.overlay.getContainerElement().classList.remove('default-theme');
        this.overlay.getContainerElement().classList.add('black-theme');
      } else {
        this.overlay.getContainerElement().classList.add('default-theme');
      }
      if (document.body.classList.contains('black-theme')) {
        document.body.classList.remove('black-theme');
        document.body.classList.add('default-theme');
      } else if (document.body.classList.contains('default-theme')) {
        document.body.classList.remove('default-theme');
        document.body.classList.add('black-theme');
      } else {
        document.body.classList.add('default-theme');
      }
    }
  }

}
