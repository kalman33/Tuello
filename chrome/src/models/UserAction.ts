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
  scrollX?: number;
  scrollY?: number;
  value?: string;
  location?: string;
  htmlCoordinates?: ICoordinates;
}

export class UserAction implements IUserAction {
  public frame: IFrame;
  public type: string;
  public x: number;
  public y: number;
  public hrefLocation: string;

  public scrollX: number;
  public scrollY: number;

  public value: string;

  public imageType: ImageType;
  public htmlCoordinates: ICoordinates
  public element: string;

  constructor(e: MouseEvent) {
    if (e) {
    this.type = e.type;
    switch (this.type) {
      case 'click':
        this.x = e.pageX;
        this.y = e.pageY;
        this.hrefLocation = window.location.href;
        break;
      case 'scroll':
        this.scrollX = (window as any).scrollX;
        this.scrollY = (window as any).scrollY;
        break;
      // case 'change':
      case 'input':
        // getBoundingClientRect : method returns the size of an element and its position relative to the viewport.
        const rect = (e.target as any).getBoundingClientRect();
        this.x = Math.ceil(rect.left + window.scrollX);
        this.y = Math.ceil(rect.top + window.scrollY);
        this.value = (e.target as any).value;
        break;
      }
    }

  }
}

enum ImageType {
  IMG = 'IMG',
  BACKGROUND = 'BACKGROUND'
}
