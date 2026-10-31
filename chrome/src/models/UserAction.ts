import { IFrame } from './IFrame';
import { ITargetDescriptor } from './TargetDescriptor';
import { buildSelector } from '../utils/cssSelector';
import { findClickableAncestor } from '../utils/labelSelector';
import { describeTarget } from '../utils/targetDescriptor';

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
  /** Date.now() pris dans la page au moment de l'évènement (voir IUserAction côté Angular) */
  eventTimestamp?: number;
  /** Élément visé (rôle, libellé, texte) : export Playwright, et cible du rejeu quand
   * la mise en page a bougé (voir ITargetDescriptor) */
  target?: ITargetDescriptor;
  /** Point du clic relatif au coin haut-gauche de l'élément visé : un clic rejoué sur la
   * cible retrouvée ailleurs dans la page tombe au même endroit de l'élément */
  targetOffset?: ITargetOffset;
}

export interface ITargetOffset {
  x: number;
  y: number;
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

  public label: string;
  public labelTag: string;
  public selector: string;

  public imageType: ImageType;
  public htmlCoordinates: ICoordinates;
  public element: string;
  public clientWidth: number;
  public clientHeight: number;
  public eventTimestamp = Date.now();
  public target: ITargetDescriptor;
  public targetOffset: ITargetOffset;

  constructor(e: MouseEvent) {
    if (e) {
      this.type = e.type;
      switch (this.type) {
        case 'click':
          this.x = e.pageX;
          this.y = e.pageY;
          this.hrefLocation = window.location.href;
          // Le texte cliqué est souvent un <span> : c'est le bouton qui l'englobe qu'on décrit
          const clickable = findClickableAncestor(e.target as Element);
          this.target = describeTarget(clickable);
          if (clickable?.getBoundingClientRect) {
            const clickableRect = clickable.getBoundingClientRect();
            this.targetOffset = { x: e.clientX - clickableRect.left, y: e.clientY - clickableRect.top };
          }
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
          // Les coordonnées seules ne suffisent pas : cf. buildSelector.
          this.selector = buildSelector(e.target as Element);
          this.target = describeTarget(e.target as Element);
          break;
      }
    }
  }
}

export enum ImageType {
  IMG = 'IMG',
  BACKGROUND = 'BACKGROUND'
}
