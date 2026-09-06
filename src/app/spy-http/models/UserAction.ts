import { IFrame } from './IFrame';

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
  imageType?: ImageType;
  htmlCoordinates?: ICoordinates;
  clientWidth?: number;
  clientHeight?: number;
}

export enum ImageType {
  IMG = 'IMG',
  BACKGROUND = 'BACKGROUND'
}
