/**
 * Position du tooltip par rapport à l'élément cible
 */
export type GuideStepPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * Configuration d'une étape du guide
 */
export interface GuideTourStep {
  /** Identifiant unique de l'étape */
  id: string;
  /** Sélecteur CSS de l'élément à mettre en évidence */
  targetSelector: string;
  /** Clé i18n pour le titre */
  titleKey: string;
  /** Clé i18n pour le contenu descriptif */
  contentKey: string;
  /** Position du tooltip par rapport à l'élément */
  position: GuideStepPosition;
  /** Padding autour de l'élément surligné (en pixels) */
  highlightPadding?: number;
  /** Ordre d'affichage de l'étape */
  order: number;
}

/**
 * Configuration d'un tour guidé complet
 */
export interface GuideTour {
  /** Identifiant unique du tour ('recorder' | 'spy' | 'track' | 'search' | 'json') */
  id: string;
  /** Clé i18n pour le titre du tour */
  titleKey: string;
  /** Liste des étapes du tour */
  steps: GuideTourStep[];
}

/**
 * État persisté du guide
 */
export interface GuideTourState {
  /** Le modal de bienvenue a été affiché */
  welcomeShown: boolean;
  /** Liste des IDs des tours complétés */
  completedTours: string[];
  /** ID du tour actuellement en cours (null si aucun) */
  currentTour: string | null;
  /** Index de l'étape actuelle dans le tour */
  currentStepIndex: number;
  /** L'utilisateur a choisi de ne plus afficher le guide */
  neverShowAgain: boolean;
}

/**
 * Résultat de la fermeture du dialog de bienvenue
 */
export interface WelcomeDialogResult {
  /** Action choisie par l'utilisateur */
  action: 'startTour' | 'skip';
  /** L'utilisateur a coché "ne plus afficher" */
  neverShowAgain: boolean;
}

/**
 * Configuration des tours par section
 */
export const GUIDE_TOURS: GuideTour[] = [
  {
    id: 'recorder',
    titleKey: 'mmn.guide.recorder.title',
    steps: [
      {
        id: 'recorder-controls',
        targetSelector: '#guide-recorder-controls',
        titleKey: 'mmn.guide.recorder.step1.title',
        contentKey: 'mmn.guide.recorder.step1.content',
        position: 'bottom',
        order: 1
      },
      {
        id: 'recorder-profiles',
        targetSelector: '#guide-recorder-profiles',
        titleKey: 'mmn.guide.recorder.step2.title',
        contentKey: 'mmn.guide.recorder.step2.content',
        position: 'bottom',
        order: 2
      },
      {
        id: 'recorder-mock-toggle',
        targetSelector: '#guide-recorder-mock',
        titleKey: 'mmn.guide.recorder.step3.title',
        contentKey: 'mmn.guide.recorder.step3.content',
        position: 'bottom',
        order: 3
      },
      {
        id: 'recorder-record-toggle',
        targetSelector: '#guide-recorder-record',
        titleKey: 'mmn.guide.recorder.step4.title',
        contentKey: 'mmn.guide.recorder.step4.content',
        position: 'bottom',
        order: 4
      },
      {
        id: 'recorder-editor',
        targetSelector: '#guide-recorder-editor',
        titleKey: 'mmn.guide.recorder.step5.title',
        contentKey: 'mmn.guide.recorder.step5.content',
        position: 'top',
        order: 5
      }
    ]
  },
  {
    id: 'spy',
    titleKey: 'mmn.guide.spy.title',
    steps: [
      {
        id: 'spy-record',
        targetSelector: '#guide-spy-record',
        titleKey: 'mmn.guide.spy.step1.title',
        contentKey: 'mmn.guide.spy.step1.content',
        position: 'bottom',
        order: 1
      },
      {
        id: 'spy-play',
        targetSelector: '#guide-spy-play',
        titleKey: 'mmn.guide.spy.step2.title',
        contentKey: 'mmn.guide.spy.step2.content',
        position: 'bottom',
        order: 2
      },
      {
        id: 'spy-actions',
        targetSelector: '#guide-spy-actions',
        titleKey: 'mmn.guide.spy.step3.title',
        contentKey: 'mmn.guide.spy.step3.content',
        position: 'right',
        order: 3
      },
      {
        id: 'spy-shortcuts',
        targetSelector: '#guide-spy-shortcuts',
        titleKey: 'mmn.guide.spy.step4.title',
        contentKey: 'mmn.guide.spy.step4.content',
        position: 'left',
        order: 4
      }
    ]
  },
  {
    id: 'track',
    titleKey: 'mmn.guide.track.title',
    steps: [
      {
        id: 'track-input',
        targetSelector: '#guide-track-input',
        titleKey: 'mmn.guide.track.step1.title',
        contentKey: 'mmn.guide.track.step1.content',
        position: 'bottom',
        order: 1
      },
      {
        id: 'track-toggle',
        targetSelector: '#guide-track-toggle',
        titleKey: 'mmn.guide.track.step2.title',
        contentKey: 'mmn.guide.track.step2.content',
        position: 'bottom',
        order: 2
      },
      {
        id: 'track-results',
        targetSelector: '#guide-track-results',
        titleKey: 'mmn.guide.track.step3.title',
        contentKey: 'mmn.guide.track.step3.content',
        position: 'top',
        order: 3
      }
    ]
  },
  {
    id: 'search',
    titleKey: 'mmn.guide.search.title',
    steps: [
      {
        id: 'search-input',
        targetSelector: '#guide-search-input',
        titleKey: 'mmn.guide.search.step1.title',
        contentKey: 'mmn.guide.search.step1.content',
        position: 'bottom',
        order: 1
      },
      {
        id: 'search-add',
        targetSelector: '#guide-search-add',
        titleKey: 'mmn.guide.search.step2.title',
        contentKey: 'mmn.guide.search.step2.content',
        position: 'bottom',
        order: 2
      },
      {
        id: 'search-toggle',
        targetSelector: '#guide-search-toggle',
        titleKey: 'mmn.guide.search.step3.title',
        contentKey: 'mmn.guide.search.step3.content',
        position: 'bottom',
        order: 3
      }
    ]
  },
  {
    id: 'json',
    titleKey: 'mmn.guide.json.title',
    steps: [
      {
        id: 'json-input',
        targetSelector: '#guide-json-input',
        titleKey: 'mmn.guide.json.step1.title',
        contentKey: 'mmn.guide.json.step1.content',
        position: 'bottom',
        order: 1
      },
      {
        id: 'json-format',
        targetSelector: '#guide-json-format',
        titleKey: 'mmn.guide.json.step2.title',
        contentKey: 'mmn.guide.json.step2.content',
        position: 'bottom',
        order: 2
      },
      {
        id: 'json-copy',
        targetSelector: '#guide-json-copy',
        titleKey: 'mmn.guide.json.step3.title',
        contentKey: 'mmn.guide.json.step3.content',
        position: 'bottom',
        order: 3
      }
    ]
  }
];

/**
 * Fonctionnalités présentées dans le dialog de bienvenue
 */
export interface WelcomeFeature {
  icon: string;
  titleKey: string;
  descKey: string;
  route: string;
  tourId: string;
}

export const WELCOME_FEATURES: WelcomeFeature[] = [
  {
    icon: 'http',
    titleKey: 'mmn.guide.welcome.feature.recorder',
    descKey: 'mmn.guide.welcome.feature.recorder.desc',
    route: '/recorder',
    tourId: 'recorder'
  },
  {
    icon: 'play_circle',
    titleKey: 'mmn.guide.welcome.feature.spy',
    descKey: 'mmn.guide.welcome.feature.spy.desc',
    route: '/spy',
    tourId: 'spy'
  },
  {
    icon: 'track_changes',
    titleKey: 'mmn.guide.welcome.feature.track',
    descKey: 'mmn.guide.welcome.feature.track.desc',
    route: '/track',
    tourId: 'track'
  },
  {
    icon: 'search',
    titleKey: 'mmn.guide.welcome.feature.search',
    descKey: 'mmn.guide.welcome.feature.search.desc',
    route: '/search',
    tourId: 'search'
  },
  {
    icon: 'data_object',
    titleKey: 'mmn.guide.welcome.feature.json',
    descKey: 'mmn.guide.welcome.feature.json.desc',
    route: '/json-formatter',
    tourId: 'json'
  }
];
