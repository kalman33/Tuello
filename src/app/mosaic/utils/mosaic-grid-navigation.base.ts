import { Directive, ElementRef, effect, inject, OnDestroy } from '@angular/core';
import { MosaicNavigationService } from '../services/mosaic-navigation.service';

/**
 * Navigation clavier des vues en grille (tuiles). L'arbre gère son propre curseur :
 * lui seul sait traduire un index en ligne affichée. Ici la correspondance est
 * directe, d'où la mutualisation.
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

  constructor() {
    // Le template lit activeIndex() pour la surbrillance ; l'effet ne sert qu'au
    // défilement, différé d'une frame pour que la tuile active soit déjà rendue.
    effect(() => {
      const index = this.activeIndex();
      requestAnimationFrame(() => this.scrollIntoView(index));
    });
  }

  ngOnDestroy(): void {
    this.activateSub.unsubscribe();
    this.navigationService.reset();
  }

  /** Ouvre le site, ou déplie la catégorie, selon la vue */
  protected abstract activateNavItem(index: number, background: boolean): void;

  /** À appeler dès que la liste affichée change */
  protected syncNavigation(count: number): void {
    this.navigationService.setCount(count);
    this.navigationService.setRowNavigator((current, delta) => this.neighborInRow(current, delta));
  }

  /**
   * Cherche la rangée voisine sur la position réelle des éléments : d'un bloc à
   * l'autre (épinglés, sections), les rangées n'ont ni la même largeur ni le même
   * nombre d'éléments, aucun pas fixe ne conviendrait.
   */
  private neighborInRow(current: number, delta: number): number | null {
    const items = Array.from(this.hostRef.nativeElement.querySelectorAll<HTMLElement>('[data-nav-index]')).map((element) => ({
      index: Number(element.dataset['navIndex']),
      rect: element.getBoundingClientRect()
    }));
    const from = items.find((item) => item.index === current)?.rect;
    if (!from) {
      return null;
    }

    const fromCenter = (from.top + from.bottom) / 2;
    const beyond = items.filter(({ rect }) => (delta > 0 ? rect.top > fromCenter : rect.bottom < fromCenter));
    if (beyond.length === 0) {
      return null;
    }

    const distance = (top: number) => Math.abs(top - from.top);
    const rowTop = beyond.reduce((nearest, { rect }) => (distance(rect.top) < distance(nearest) ? rect.top : nearest), beyond[0].rect.top);
    const row = beyond.filter(({ rect }) => rect.top <= rowTop + from.height / 2 && rect.bottom >= rowTop);

    const center = (rect: DOMRect) => (rect.left + rect.right) / 2;
    const offset = (rect: DOMRect) => Math.abs(center(rect) - center(from));
    return row.reduce((closest, item) => (offset(item.rect) < offset(closest.rect) ? item : closest)).index;
  }

  private scrollIntoView(index: number): void {
    if (index < 0) {
      return;
    }
    this.hostRef.nativeElement.querySelector(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
