import { NgZone } from '@angular/core';

/** Attribut marquant un élément capable de recevoir un site glissé */
export const MOSAIC_DROP_ATTR = 'data-mosaic-drop';

/** Valeur de l'attribut pour la cible « racine » ; ailleurs c'est l'id de la catégorie */
export const MOSAIC_DROP_ROOT = 'root';

/**
 * Suit la zone de dépôt survolée pendant un glisser CDK.
 *
 * Le CDK ne sait pas répondre à la question : `cdkDragMoved` réveille la zone
 * Angular à chaque pixel parcouru, et ses conteneurs imbriqués se fient à des
 * positions mises en cache au démarrage du glisser, fausses dès que le
 * réordonnancement décale les tuiles. On interroge donc la pile d'éléments sous
 * le curseur, qui reflète toujours l'affichage réel.
 *
 * `onChange` n'est appelé qu'au changement de zone — et hors zone Angular : au
 * composant de décider ce qu'il rafraîchit.
 */
export class MosaicDropTargetTracker {
  private listener?: (event: PointerEvent) => void;
  private current: string | null = null;

  constructor(
    private ngZone: NgZone,
    private onChange: (target: string | null) => void
  ) {}

  get target(): string | null {
    return this.current;
  }

  start(): void {
    this.stopTracking();
    this.ngZone.runOutsideAngular(() => {
      this.listener = (event: PointerEvent) => this.update(event.clientX, event.clientY);
      document.addEventListener('pointermove', this.listener);
    });
  }

  /**
   * Arrête l'écoute en gardant la cible : le CDK émet `ended` avant `dropped`, et
   * c'est `dropped` qui a besoin de savoir où le site a été lâché.
   */
  stopTracking(): void {
    if (this.listener) {
      document.removeEventListener('pointermove', this.listener);
      this.listener = undefined;
    }
  }

  /** Fin du glisser : plus d'écoute, plus de zone surlignée */
  reset(): void {
    this.stopTracking();
    if (this.current !== null) {
      this.current = null;
      this.onChange(null);
    }
  }

  private update(x: number, y: number): void {
    const found = this.targetUnderPointer(x, y);
    if (found !== this.current) {
      this.current = found;
      this.onChange(found);
    }
  }

  /**
   * L'aperçu de glisser suit le curseur et masque la zone visée : on parcourt toute
   * la pile d'éléments pour passer outre.
   */
  private targetUnderPointer(x: number, y: number): string | null {
    for (const element of document.elementsFromPoint(x, y)) {
      if (element.closest('.cdk-drag-preview')) {
        continue;
      }
      const zone = element.closest(`[${MOSAIC_DROP_ATTR}]`);
      if (zone) {
        return zone.getAttribute(MOSAIC_DROP_ATTR);
      }
    }
    return null;
  }
}
