import {IFrame} from './IFrame';

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
  imageType?: ImageType;
  htmlCoordinates?: ICoordinates;
  clientWidth: number;
  clientHeight: number;
}

export enum ImageType {
  IMG = 'IMG',
  BACKGROUND = 'BACKGROUND'
}