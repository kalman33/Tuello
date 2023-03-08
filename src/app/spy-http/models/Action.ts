/**
 * Action
 */
import {IUserAction} from './UserAction';
import {ActionType} from './ActionType';

export class Action {
  id: string;

  public actionType: ActionType;
  public userAction: IUserAction;
  public data: any; // pour les images
  public delay = 0;

  constructor(timeDiff: number, actionType: ActionType, action: IUserAction, data?: any) {
    this.id =  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

    this.actionType = actionType;
    this.userAction = action;
    this.data = data;
    this.delay = timeDiff;

  }
}
