import { WindowSize } from './WindowSize';
import { HttpReturn } from '../../recorder-http/models/http.return';
import { Action } from './Action';
import { ConsoleLogEntry } from './ConsoleLogEntry';
import { InitialState } from './InitialState';

export class Record {
  public actions: Action[];
  public windowSize: WindowSize;
  public httpRecords: HttpReturn[];
  public consoleLogs?: ConsoleLogEntry[];
  /** Stockage du navigateur au démarrage de l'enregistrement (export Playwright) */
  public initialState?: InitialState;
  /** Scénario chargé dans l'éditeur : la sauvegarde propose de le mettre à jour */
  public scenarioId?: string;
  public last: number;

  constructor(windowSize?: WindowSize) {
    if (windowSize) {
      this.windowSize = windowSize;
    }
    this.actions = [];
  }
}
