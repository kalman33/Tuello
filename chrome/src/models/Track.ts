import { TrackType } from './TrackType';
import { ICoordinates } from './UserAction';

/**
 * Track
 */
export class Track {
  id: string;
  type: TrackType;
  x?: number;
  y?: number;
  url: string;
  hrefLocation: string;
  querystring: any;
  body?: any;
  htmlCoordinates: ICoordinates;
  element: string;
  parentPosition: string;
}
