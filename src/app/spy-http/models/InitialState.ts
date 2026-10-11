/**
 * Photo du stockage du navigateur prise au démarrage d'un enregistrement, sur la page de
 * départ : l'export Playwright la restaure pour que le test démarre dans le même contexte
 * (utilisateur connecté, préférences, contexte métier sélectionné).
 *
 * Elle peut contenir des jetons : elle n'est jamais affichée dans le rapport HTML, et
 * l'export laisse choisir, clé par clé, ce qui part dans le dépôt.
 */
export interface InitialState {
  /** Origine de la page photographiée : le stockage est propre à chaque origine */
  origin: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  /** Cookies lisibles en JavaScript (les cookies HttpOnly ne le sont pas) */
  cookies: Record<string, string>;
  capturedAt: number;
}
