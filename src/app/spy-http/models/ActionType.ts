export enum ActionType {
  SCREENSHOT = 'SCREENSHOT',
  EVENT = 'EVENT',
  RECORD_BY_IMAGE = 'RECORD_BY_IMAGE',
  RECORD_BY_LABEL = 'RECORD_BY_LABEL',
  COMMENT = 'COMMENT',
  NAVIGATE = 'NAVIGATE',
  /** Repère posé par l'utilisateur : sépare la mise en place du test lui-même (export Playwright) */
  TEST_START = 'TEST_START',
  /** Vérification (texte, visibilité) posée au clic droit pendant l'enregistrement */
  ASSERTION = 'ASSERTION'
}
