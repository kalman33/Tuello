import { Injectable } from '@angular/core';
import { ComparisonResult } from '../models/ComparisonResult';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  public comparisonResults: ComparisonResult[];
  public pausedActionNumber = 0;

  constructor() {
  } 
}
