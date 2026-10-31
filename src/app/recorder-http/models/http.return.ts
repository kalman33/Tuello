export interface HttpReturn {
  key: string;
  response: any;
  httpCode: any;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, string>; // headers posés par l'application sur la requête (pas ceux ajoutés par le navigateur)
  method?: string;
  duration?: number; // en millisecondes
  body?: any; // corps envoyé (POST/PUT...), pour l'affichage en arbre dans le rapport
  timestamp?: number; // Date.now() au départ de la requête, pour entrelacer avec les actions dans le rapport
  requestId?: string; // corrélation pour attacher une capture d'écran différée (après stabilisation du DOM)
  frameLevel?: number; // niveau de frame d'origine (0 = page principale, 1 = iframe...) : au rejeu, le mock ne répond qu'aux requêtes de ce niveau
  screenshot?: string; // data URL JPEG du résultat, capturée une fois le DOM stabilisé après la réponse (pas de repère : la page a déjà changé depuis le clic)
}
