import { WindowSize } from './WindowSize';
import { HttpReturn } from '../../recorder-http/models/http.return';
import { Action } from './Action';
import { ConsoleLogEntry } from './ConsoleLogEntry';

export class Record {
  public actions: Action[];
  public windowSize: WindowSize;
  public httpRecords: HttpReturn[];
  public consoleLogs?: ConsoleLogEntry[];
  public last: number;

  constructor(windowSize?: WindowSize) {
    if (windowSize) {
      this.windowSize = windowSize;
    }
    this.actions = [];
  }
}
