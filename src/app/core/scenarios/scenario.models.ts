import { Action } from '../../spy-http/models/Action';
import { WindowSize } from '../../spy-http/models/WindowSize';

/**
 * Un scénario est un enregistrement Spy & Replay nommé et conservé durablement.
 * Il ne contient que les actions rejouables : les captures de comparaison
 * (SCREENSHOT) et les commentaires sont écartés, ainsi que les images base64,
 * pour que la liste des scénarios reste légère dans chrome.storage.local.
 */
export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  windowSize?: WindowSize;
  actions: Action[];
}

export const SCENARIOS_KEY = 'tuelloScenarios';

/**
 * Retire les navigations placées en tête d'un scénario.
 *
 * Un enregistrement Spy & Replay commence toujours par une action NAVIGATE vers
 * la page où l'enregistrement a démarré. Un scénario, lui, est rejoué sur une
 * page déjà ouverte (la cible de la tuile mosaïque) : rejouer cette navigation
 * initiale renverrait l'onglet vers l'URL enregistrée, en conflit avec l'URL de
 * la tuile. Les navigations suivantes, elles, font partie du scénario.
 */
export function stripLeadingNavigations(actions: Action[] = []): Action[] {
  const firstReplayable = (actions ?? []).findIndex((action) => action?.actionType !== 'NAVIGATE');
  return firstReplayable === -1 ? [] : actions.slice(firstReplayable);
}
