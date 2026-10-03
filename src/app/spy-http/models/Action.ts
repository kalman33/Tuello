/**
 * Action
 */
import { IUserAction } from './UserAction';
import { ActionType } from './ActionType';

export class Action {
  id: string;

  public actionType: ActionType;
  public userAction: IUserAction;
  public data: any; // pour les images
  public delay = 0;
  /** Horodatage absolu de création (Date.now()), pour entrelacer actions et requêtes HTTP par ordre chronologique dans le rapport. */
  public timestamp?: number;
  /** Position du clic (coordonnées de page) + géométrie de défilement/viewport au moment de la
   * capture "avant" (voir `attachClickScreenshot`), pour dessiner un repère sur `data`. */
  public screenshotMarker?: {
    pageX: number;
    pageY: number;
    scrollX: number;
    scrollY: number;
    viewportWidth: number;
    viewportHeight: number;
  };

  constructor(timeDiff: number, actionType: ActionType, action: IUserAction, data?: any) {
    this.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    this.actionType = actionType;
    this.userAction = action;
    this.data = data;
    this.delay = timeDiff;
  }
}
