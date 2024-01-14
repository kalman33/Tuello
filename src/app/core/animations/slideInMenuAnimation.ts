// import the required animation functions from the angular animations module
import {animate, query, stagger, state, style, transition, trigger} from '@angular/animations';

export const slideInMenuAnimation =
  // trigger name for attaching this animation to an element using the [@triggerName] syntax
  trigger('slideInMenuAnimation', [
    transition('inactive => active', [  // before 2.1: transition('void => *', [
      query('a ', style({transform: 'translateX(-100%)'})),
      query('a',
        stagger('100ms', [
          animate('200ms', style({transform: 'translateX(0)'}))
        ]))
    ])

  ]);

