import {
  trigger,
  state,
  style,
  animate,
  transition
} from '@angular/animations';

/**
 * Animation d'entrée/sortie pour l'overlay du guide
 */
export const guideOverlayAnimation = trigger('guideOverlay', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('200ms ease-out', style({ opacity: 1 }))
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0 }))
  ])
]);

/**
 * Animation d'entrée/sortie pour le tooltip du guide
 */
export const guideTooltipAnimation = trigger('guideTooltip', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.9) translateY(10px)' }),
    animate('250ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' }))
  ])
]);

/**
 * Animation de pulsation pour l'élément surligné
 */
export const guidePulseAnimation = trigger('guidePulse', [
  state('pulse', style({})),
  transition('* => pulse', [
    animate('0.5s ease-in-out')
  ])
]);

/**
 * Animation pour le dialog de bienvenue
 */
export const welcomeDialogAnimation = trigger('welcomeDialog', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.95)' }),
    animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'scale(1)' }))
  ])
]);

/**
 * Animation pour les features du dialog de bienvenue
 */
export const welcomeFeatureAnimation = trigger('welcomeFeature', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-20px)' }),
    animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
  ])
]);
