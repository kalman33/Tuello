import { NgClass, NgStyle } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { GuideTourStep } from '../guide-tour.models';
import { guideOverlayAnimation, guideTooltipAnimation } from '../guide-tour.animations';

/** Délai d'attente avant d'activer les listeners (pour laisser l'animation se terminer) */
const ANIMATION_SETTLE_DELAY = 300;

/** Délai de throttle pour les recalculs de position */
const POSITION_THROTTLE_MS = 100;

@Component({
  selector: 'mmn-guide-step',
  templateUrl: './guide-step.component.html',
  styleUrls: ['./guide-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgClass,
    NgStyle,
    MatButtonModule,
    MatIconModule,
    TranslatePipe
  ],
  animations: [guideOverlayAnimation, guideTooltipAnimation]
})
export class GuideStepComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() step!: GuideTourStep;
  @Input() currentIndex = 0;
  @Input() totalSteps = 0;
  @Input() targetElement!: HTMLElement;

  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() skip = new EventEmitter<void>();

  tooltipStyle: { [key: string]: string } = {};
  positionClass = '';
  isReady = false; // Contrôle l'affichage du tooltip (après calcul de position)

  private resizeObserver: ResizeObserver | null = null;
  private isAnimating = true;
  private positionThrottleId: number | null = null;
  private rafId: number | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    // Ajouter la classe de surlignage a l'element cible
    if (this.targetElement) {
      this.targetElement.classList.add('guide-highlighted');
    }

    // Calculer la position AVANT l'affichage pour éviter le saut
    this.calculatePosition();

    // Marquer comme prêt après un court délai pour s'assurer que le DOM est stable
    // et que la position a été appliquée
    requestAnimationFrame(() => {
      this.isReady = true;
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    // Attendre la fin de l'animation avant d'activer les listeners
    // pour éviter les recalculs pendant l'animation d'entrée
    setTimeout(() => {
      this.isAnimating = false;

      // Observer les changements de taille de la fenetre (hors zone Angular pour performance)
      this.ngZone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => {
          this.throttledCalculatePosition();
        });
        this.resizeObserver.observe(document.body);
      });
    }, ANIMATION_SETTLE_DELAY);
  }

  ngOnDestroy(): void {
    // Retirer la classe de surlignage
    if (this.targetElement) {
      this.targetElement.classList.remove('guide-highlighted');
    }

    // Deconnecter l'observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Annuler les timers en cours
    if (this.positionThrottleId !== null) {
      clearTimeout(this.positionThrottleId);
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isAnimating) {
      this.throttledCalculatePosition();
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isAnimating) {
      this.throttledCalculatePosition();
    }
  }

  /**
   * Throttle les recalculs de position pour éviter les saccades
   */
  private throttledCalculatePosition(): void {
    if (this.positionThrottleId !== null) {
      return; // Déjà en attente
    }

    this.positionThrottleId = window.setTimeout(() => {
      this.positionThrottleId = null;

      // Utiliser requestAnimationFrame pour synchroniser avec le rendu
      this.rafId = requestAnimationFrame(() => {
        this.ngZone.run(() => {
          this.calculatePosition();
        });
      });
    }, POSITION_THROTTLE_MS);
  }

  onNext(): void {
    this.next.emit();
  }

  onPrevious(): void {
    this.previous.emit();
  }

  onSkip(): void {
    this.skip.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    // Empecher la propagation pour ne pas fermer le tooltip
    event.stopPropagation();
  }

  private calculatePosition(): void {
    if (!this.targetElement) return;

    const targetRect = this.targetElement.getBoundingClientRect();
    const tooltipOffset = 16;
    const tooltipWidth = 320; // max-width du tooltip
    const tooltipHeight = 180; // hauteur estimee du tooltip
    const margin = 12; // marge par rapport aux bords de l'ecran

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculer la position du tooltip en fonction de la position demandee
    const position = this.step.position;
    this.positionClass = `position-${position}`;

    let top: number;
    let left: number;

    switch (position) {
      case 'top':
        top = targetRect.top - tooltipOffset;
        left = targetRect.left + targetRect.width / 2;
        // Ajuster horizontalement pour rester dans l'ecran
        left = this.clampHorizontal(left, tooltipWidth, viewportWidth, margin);
        this.tooltipStyle = {
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(-50%, -100%)'
        };
        break;

      case 'bottom':
        top = targetRect.bottom + tooltipOffset;
        left = targetRect.left + targetRect.width / 2;
        // Ajuster horizontalement pour rester dans l'ecran
        left = this.clampHorizontal(left, tooltipWidth, viewportWidth, margin);
        this.tooltipStyle = {
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(-50%, 0)'
        };
        break;

      case 'left':
        top = targetRect.top + targetRect.height / 2;
        left = targetRect.left - tooltipOffset;
        // Ajuster verticalement pour rester dans l'ecran
        top = this.clampVertical(top, tooltipHeight, viewportHeight, margin);
        this.tooltipStyle = {
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(-100%, -50%)'
        };
        break;

      case 'right':
        top = targetRect.top + targetRect.height / 2;
        left = targetRect.right + tooltipOffset;
        // Ajuster verticalement pour rester dans l'ecran
        top = this.clampVertical(top, tooltipHeight, viewportHeight, margin);
        this.tooltipStyle = {
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(0, -50%)'
        };
        break;

      default:
        // Centre de l'ecran
        this.tooltipStyle = {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        };
    }

    // Ajuster si le tooltip depasse les bords
    this.adjustForViewport(viewportWidth, viewportHeight, margin, tooltipWidth, tooltipHeight);

    this.cdr.detectChanges();
  }

  /**
   * Ajuste la position horizontale pour que le tooltip reste dans l'ecran
   */
  private clampHorizontal(left: number, tooltipWidth: number, viewportWidth: number, margin: number): number {
    const halfWidth = tooltipWidth / 2;
    // Si le tooltip depasse a gauche
    if (left - halfWidth < margin) {
      return halfWidth + margin;
    }
    // Si le tooltip depasse a droite
    if (left + halfWidth > viewportWidth - margin) {
      return viewportWidth - halfWidth - margin;
    }
    return left;
  }

  /**
   * Ajuste la position verticale pour que le tooltip reste dans l'ecran
   */
  private clampVertical(top: number, tooltipHeight: number, viewportHeight: number, margin: number): number {
    const halfHeight = tooltipHeight / 2;
    // Si le tooltip depasse en haut
    if (top - halfHeight < margin) {
      return halfHeight + margin;
    }
    // Si le tooltip depasse en bas
    if (top + halfHeight > viewportHeight - margin) {
      return viewportHeight - halfHeight - margin;
    }
    return top;
  }

  private adjustForViewport(viewportWidth: number, viewportHeight: number, margin: number, tooltipWidth: number, tooltipHeight: number): void {
    // Calculer la position finale du tooltip apres transformation
    const currentLeft = parseFloat(this.tooltipStyle['left'] || '0');
    const currentTop = parseFloat(this.tooltipStyle['top'] || '0');
    const transform = this.tooltipStyle['transform'] || '';

    let finalLeft = currentLeft;
    let finalTop = currentTop;

    // Appliquer la transformation pour calculer la position finale
    if (transform.includes('-50%, -100%')) {
      // position top
      finalLeft = currentLeft - tooltipWidth / 2;
      finalTop = currentTop - tooltipHeight;
    } else if (transform.includes('-50%, 0')) {
      // position bottom
      finalLeft = currentLeft - tooltipWidth / 2;
    } else if (transform.includes('-100%, -50%')) {
      // position left
      finalLeft = currentLeft - tooltipWidth;
      finalTop = currentTop - tooltipHeight / 2;
    } else if (transform.includes('0, -50%')) {
      // position right
      finalTop = currentTop - tooltipHeight / 2;
    }

    // Verifier et corriger les depassements
    let adjustedLeft = currentLeft;
    let adjustedTop = currentTop;

    // Depassement a gauche
    if (finalLeft < margin) {
      adjustedLeft = currentLeft + (margin - finalLeft);
    }
    // Depassement a droite
    if (finalLeft + tooltipWidth > viewportWidth - margin) {
      adjustedLeft = currentLeft - (finalLeft + tooltipWidth - viewportWidth + margin);
    }
    // Depassement en haut
    if (finalTop < margin) {
      adjustedTop = currentTop + (margin - finalTop);
    }
    // Depassement en bas
    if (finalTop + tooltipHeight > viewportHeight - margin) {
      adjustedTop = currentTop - (finalTop + tooltipHeight - viewportHeight + margin);
    }

    // Appliquer les ajustements
    this.tooltipStyle['left'] = `${adjustedLeft}px`;
    this.tooltipStyle['top'] = `${adjustedTop}px`;
  }
}
