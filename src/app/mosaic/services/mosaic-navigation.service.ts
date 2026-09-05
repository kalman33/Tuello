import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface MosaicNavActivation {
  index: number;
  /** Ouverture en arrière-plan, demandée avec Ctrl/Cmd */
  background: boolean;
}

/**
 * Curseur clavier partagé par la vue affichée. Le shell traduit les touches, la
 * vue déclare le nombre d'éléments navigables et décide de ce qu'« activer »
 * veut dire : ouvrir un site, ou déplier une catégorie.
 */
@Injectable({ providedIn: 'root' })
export class MosaicNavigationService {
  readonly activeIndex = signal(-1);

  private count = 0;
  private activateSubject = new Subject<MosaicNavActivation>();
  readonly activate$ = this.activateSubject.asObservable();

  /** Appelé par la vue à chaque reconstruction de sa liste */
  setCount(count: number): void {
    this.count = count;
    if (this.activeIndex() >= count) {
      // La liste a rétréci (filtre affiné, site supprimé) : on garde un curseur
      // valide plutôt que de le perdre.
      this.activeIndex.set(count > 0 ? count - 1 : -1);
    }
  }

  moveBy(delta: number): void {
    if (this.count === 0) {
      return;
    }
    const current = this.activeIndex();
    // Première flèche : on entre dans la liste par le haut ou par le bas selon le sens
    const next = current === -1 ? (delta > 0 ? 0 : this.count - 1) : (current + delta + this.count) % this.count;
    this.activeIndex.set(next);
  }

  setActive(index: number): void {
    this.activeIndex.set(index >= 0 && index < this.count ? index : -1);
  }

  /** Entrée sans curseur positionné ouvre le premier élément : c'est le geste « je tape, j'ouvre » */
  activateCurrent(background: boolean): void {
    this.activate(this.activeIndex() === -1 ? 0 : this.activeIndex(), background);
  }

  activate(index: number, background: boolean): void {
    if (index >= 0 && index < this.count) {
      this.activateSubject.next({ index, background });
    }
  }

  clearActive(): void {
    this.activeIndex.set(-1);
  }

  /** À la destruction d'une vue : la suivante repartira d'un curseur vierge */
  reset(): void {
    this.count = 0;
    this.activeIndex.set(-1);
  }
}
