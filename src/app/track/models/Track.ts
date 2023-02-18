/**
 * Track
 */

import { TrackType } from './TrackType';

export class Track {
  id: string;
  type: TrackType;
  x?: number;
  y?: number;
  url: string;
  hrefLocation: string;
  querystring: any;
}
