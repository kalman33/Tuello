import {WindowSize} from './WindowSize';
import {HttpReturn} from '../../recorder-http/models/http.return';
import {Action} from './Action';

export class Record {
  public actions: Action[];
  public windowSize: WindowSize;
  public httpRecords: HttpReturn[];
  public last: number

  constructor(windowSize?: WindowSize) {
    if (windowSize) {
      this.windowSize = windowSize;
    }
    this.actions = [];
  }

}
