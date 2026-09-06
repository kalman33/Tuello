import { Directive, ElementRef, effect, inject, OnDestroy } from '@angular/core';
import { MosaicNavigationService } from '../services/mosaic-navigation.service';

/**
 * Navigation clavier des vues en grille (tuiles). L'arbre et les résultats de
 * recherche gèrent leur propre curseur : eux seuls savent traduire un index en
 * ligne affichée. Ici la correspondance est directe, d'où la mutualisation.
 *
 * Les classes filles déclarent le nombre d'éléments via `syncNavigation()` et
 * implémentent `activateNavItem()` (Entrée, Alt+chiffre).
 */
@Directive()
export abstract class MosaicGridNavigationBase implements OnDestroy {
  protected readonly navigationService = inject(MosaicNavigationService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly activeIndex = this.navigationService.activeIndex;

  private readonly activateSub = this.navigationService.activate$.subscribe(({ index, background }) => this.activateNavItem(index, background));
  private readonly onResize = () => this.measureColumns();

  constructor() {
    // Le template lit activeIndex() pour la surbrillance ; l'effet ne sert qu'au
    // défilement, différé d'une frame pour que la tuile active soit déjà rendue.
    effect(() => {
      const index = this.activeIndex();
      requestAnimationFrame(() => this.scrollIntoView(index));
    });
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.activateSub.unsubscribe();
    this.navigationService.reset();
  }

  /** Ouvre le site, ou déplie la catégorie, selon la vue */
  protected abstract activateNavItem(index: number, background: boolean): void;

  /** À appeler dès que la liste affichée change */
  protected syncNavigation(count: number): void {
    this.navigationService.setCount(count);
    // Les tuiles ne sont pas encore posées : la mesure attend le rendu.
    requestAnimationFrame(() => this.measureColumns());
  }

  /** Tuiles alignées sur la première rangée : le pas des flèches haut/bas */
  private measureColumns(): void {
    const tiles = Array.from(this.hostRef.nativeElement.querySelectorAll<HTMLElement>('[data-nav-index]'));
    if (tiles.length === 0) {
      return;
    }
    const firstRowTop = tiles[0].offsetTop;
    this.navigationService.setColumns(tiles.filter((tile) => tile.offsetTop === firstRowTop).length);
  }

  private scrollIntoView(index: number): void {
    if (index < 0) {
      return;
    }
    this.hostRef.nativeElement.querySelector(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
