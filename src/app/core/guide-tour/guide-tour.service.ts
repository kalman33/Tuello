import { Injectable, ApplicationRef, ComponentRef, createComponent, EnvironmentInjector } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  GuideTourState,
  GuideTour,
  GuideTourStep,
  GUIDE_TOURS,
  WelcomeDialogResult
} from './guide-tour.models';
import { WelcomeDialogComponent } from './welcome-dialog/welcome-dialog.component';
import { GuideStepComponent } from './guide-step/guide-step.component';

@Injectable({
  providedIn: 'root'
})
export class GuideTourService {
  private readonly STORAGE_KEY = 'tuelloGuideTourState';

  private stateSubject = new BehaviorSubject<GuideTourState>(this.getDefaultState());
  private currentTourSubject = new BehaviorSubject<GuideTour | null>(null);
  private currentStepSubject = new BehaviorSubject<GuideTourStep | null>(null);

  private guideStepRef: ComponentRef<GuideStepComponent> | null = null;

  /** Observable de l'état du guide */
  readonly state$: Observable<GuideTourState> = this.stateSubject.asObservable();
  /** Observable du tour en cours */
  readonly currentTour$: Observable<GuideTour | null> = this.currentTourSubject.asObservable();
  /** Observable de l'étape courante */
  readonly currentStep$: Observable<GuideTourStep | null> = this.currentStepSubject.asObservable();

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  /**
   * Initialise le service et charge l'état depuis le stockage
   */
  async init(): Promise<void> {
    const state = await this.loadState();
    this.stateSubject.next(state);
  }

  /**
   * Vérifie si c'est le premier lancement de l'application
   */
  async checkFirstLaunch(): Promise<boolean> {
    const state = await this.loadState();
    return !state.welcomeShown && !state.neverShowAgain;
  }

  /**
   * Affiche le dialog de bienvenue
   */
  async showWelcomeDialog(): Promise<void> {
    const dialogRef = this.dialog.open(WelcomeDialogComponent, {
      width: '380px',
      maxWidth: '90vw',
      maxHeight: '85vh',
      disableClose: true,
      panelClass: 'welcome-dialog-container'
    });

    const result: WelcomeDialogResult = await dialogRef.afterClosed().toPromise();

    const state = this.stateSubject.value;
    state.welcomeShown = true;
    state.neverShowAgain = result?.neverShowAgain || false;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    if (result?.action === 'startTour') {
      // Démarrer le tour après un délai pour laisser le dialog se fermer
      setTimeout(async () => {
        const currentRoute = this.router.url;
        let tourId = this.getTourIdFromRoute(currentRoute);

        // Si pas de tour disponible sur la page actuelle, naviguer vers Recorder
        if (!tourId) {
          await this.router.navigateByUrl('/recorder', { skipLocationChange: true });
          tourId = 'recorder';
          // Attendre que la navigation soit terminée
          await this.delay(300);
        }

        await this.startTour(tourId);
      }, 300);
    }
  }

  /**
   * Délai utilitaire
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Démarre un tour spécifique
   */
  async startTour(tourId: string): Promise<void> {
    const tour = GUIDE_TOURS.find(t => t.id === tourId);
    if (!tour) {
      console.warn(`Tour "${tourId}" non trouvé`);
      return;
    }

    const state = this.stateSubject.value;
    state.currentTour = tourId;
    state.currentStepIndex = 0;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    this.currentTourSubject.next(tour);
    this.showStep(tour.steps[0]);
  }

  /**
   * Passe à l'étape suivante
   */
  async nextStep(): Promise<void> {
    const state = this.stateSubject.value;
    const tour = this.currentTourSubject.value;

    if (!tour || state.currentTour !== tour.id) return;

    const nextIndex = state.currentStepIndex + 1;

    if (nextIndex >= tour.steps.length) {
      await this.completeTour();
      return;
    }

    state.currentStepIndex = nextIndex;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    this.showStep(tour.steps[nextIndex]);
  }

  /**
   * Retourne à l'étape précédente
   */
  async previousStep(): Promise<void> {
    const state = this.stateSubject.value;
    const tour = this.currentTourSubject.value;

    if (!tour || state.currentTour !== tour.id) return;

    const prevIndex = state.currentStepIndex - 1;

    if (prevIndex < 0) return;

    state.currentStepIndex = prevIndex;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    this.showStep(tour.steps[prevIndex]);
  }

  /**
   * Saute le tour en cours
   */
  async skipTour(): Promise<void> {
    this.hideStep();

    const state = this.stateSubject.value;
    state.currentTour = null;
    state.currentStepIndex = 0;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    this.currentTourSubject.next(null);
    this.currentStepSubject.next(null);
  }

  /**
   * Marque le tour comme complété
   */
  async completeTour(): Promise<void> {
    this.hideStep();

    const state = this.stateSubject.value;
    if (state.currentTour && !state.completedTours.includes(state.currentTour)) {
      state.completedTours.push(state.currentTour);
    }
    state.currentTour = null;
    state.currentStepIndex = 0;
    await this.saveState(state);
    this.stateSubject.next({ ...state });

    this.currentTourSubject.next(null);
    this.currentStepSubject.next(null);
  }

  /**
   * Réinitialise tous les tours (permet de les rejouer)
   */
  async resetAllTours(): Promise<void> {
    const state = this.getDefaultState();
    await this.saveState(state);
    this.stateSubject.next(state);
  }

  /**
   * Réactive uniquement le dialog de bienvenue
   */
  async resetWelcome(): Promise<void> {
    const state = this.stateSubject.value;
    state.welcomeShown = false;
    state.neverShowAgain = false;
    await this.saveState(state);
    this.stateSubject.next({ ...state });
  }

  /**
   * Vérifie si un tour a été complété
   */
  isTourCompleted(tourId: string): boolean {
    return this.stateSubject.value.completedTours.includes(tourId);
  }

  /**
   * Vérifie si un tour est en cours
   */
  isTourActive(): boolean {
    return this.stateSubject.value.currentTour !== null;
  }

  /**
   * Obtient le tour correspondant à une route
   */
  getTourIdFromRoute(route: string): string | null {
    if (route.includes('/recorder') || route === '/') {
      return 'recorder';
    } else if (route.includes('/spy')) {
      return 'spy';
    } else if (route.includes('/track')) {
      return 'track';
    } else if (route.includes('/search')) {
      return 'search';
    } else if (route.includes('/json-formatter')) {
      return 'json';
    }
    return null;
  }

  /**
   * Affiche une étape du guide
   */
  private showStep(step: GuideTourStep): void {
    this.hideStep();
    this.currentStepSubject.next(step);

    // Créer le composant d'étape dynamiquement
    const tour = this.currentTourSubject.value;
    if (!tour) return;

    // Attendre que l'élément soit disponible avec retry
    this.waitForElement(step.targetSelector, 10, 100).then(targetElement => {
      if (!targetElement) {
        console.warn(`Élément cible "${step.targetSelector}" non trouvé après plusieurs tentatives`);
        return;
      }

      // Créer le composant overlay
      this.guideStepRef = createComponent(GuideStepComponent, {
        environmentInjector: this.injector
      });

      // Configurer les inputs
      this.guideStepRef.instance.step = step;
      this.guideStepRef.instance.currentIndex = this.stateSubject.value.currentStepIndex;
      this.guideStepRef.instance.totalSteps = tour.steps.length;
      this.guideStepRef.instance.targetElement = targetElement as HTMLElement;

      // Configurer les outputs
      this.guideStepRef.instance.next.subscribe(() => this.nextStep());
      this.guideStepRef.instance.previous.subscribe(() => this.previousStep());
      this.guideStepRef.instance.skip.subscribe(() => this.skipTour());

      // Attacher au DOM
      this.appRef.attachView(this.guideStepRef.hostView);
      document.body.appendChild(this.guideStepRef.location.nativeElement);
    });
  }

  /**
   * Attend qu'un élément soit disponible dans le DOM
   */
  private waitForElement(selector: string, maxRetries: number, intervalMs: number): Promise<Element | null> {
    return new Promise((resolve) => {
      let attempts = 0;

      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        attempts++;
        if (attempts >= maxRetries) {
          resolve(null);
          return;
        }

        setTimeout(check, intervalMs);
      };

      // Premier essai après un court délai
      setTimeout(check, 50);
    });
  }

  /**
   * Cache l'étape courante
   */
  private hideStep(): void {
    if (this.guideStepRef) {
      this.appRef.detachView(this.guideStepRef.hostView);
      this.guideStepRef.destroy();
      this.guideStepRef = null;
    }

    // Retirer la classe de surlignage de tous les éléments
    document.querySelectorAll('.guide-highlighted').forEach(el => {
      el.classList.remove('guide-highlighted');
    });
  }

  /**
   * Charge l'état depuis chrome.storage.local
   */
  private loadState(): Promise<GuideTourState> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        const state = result[this.STORAGE_KEY] as GuideTourState;
        resolve(state || this.getDefaultState());
      });
    });
  }

  /**
   * Sauvegarde l'état dans chrome.storage.local
   */
  private saveState(state: GuideTourState): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: state }, () => resolve());
    });
  }

  /**
   * Retourne l'état par défaut
   */
  private getDefaultState(): GuideTourState {
    return {
      welcomeShown: false,
      completedTours: [],
      currentTour: null,
      currentStepIndex: 0,
      neverShowAgain: false
    };
  }
}
