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
