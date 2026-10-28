import { IFrame } from './IFrame';
import { ITargetDescriptor } from '../../../../chrome/src/models/TargetDescriptor';

export interface ICoordinates {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface IUserAction {
  frame: IFrame;
  type: string;
  x?: number;
  y?: number;
  key?: number;
  hrefLocation?: string;
  scrollX?: number;
  scrollY?: number;
  value?: string;
  /** Libellé recherché au rejeu pour les actions `recordByLabel` */
  label?: string;
  /** Balise de l'élément d'origine : départage deux éléments portant le même libellé */
  labelTag?: string;
  /** Sélecteur CSS du champ saisi : rejeu fiable même si la mise en page a bougé */
  selector?: string;
  imageType?: ImageType;
  htmlCoordinates?: ICoordinates;
  clientWidth?: number;
  clientHeight?: number;
  /** Date.now() pris dans la page au moment de l'évènement, et non à sa réception par le
   * service worker : sert à placer l'action par rapport aux requêtes HTTP qu'elle déclenche,
   * horodatées elles aussi dans la page. */
  eventTimestamp?: number;
  /** Élément visé (rôle, libellé, texte), pris à l'enregistrement : sert à l'export
   * Playwright ; le rejeu Tuello garde coordonnées et sélecteur, et ne s'en sert en rejeu
   * accéléré que pour savoir quand la cible est affichée. */
  target?: ITargetDescriptor;
  /** Document (au sens Chrome) où l'action a été enregistrée. Un changement de route d'une
   * SPA garde le même document, un vrai chargement de page en crée un nouveau : le rejeu
   * accéléré sait ainsi si une navigation complète a eu lieu entre deux actions. */
  documentId?: string;
}

export enum ImageType {
  IMG = 'IMG',
  BACKGROUND = 'BACKGROUND'
}
