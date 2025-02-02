import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'recorder',
    loadChildren: () => import('./recorder-http/recorder-http-routes').then(m => m.routes)

  },
  {
    path: 'settings',
    loadChildren: () => import('./settings/settings-routes').then(m => m.routes)
  },
  {
    path: 'spy',
    loadChildren: () => import('./spy-http/spy-http-routes').then(m => m.routes)
  },
  {
    path: 'track',
    loadChildren: () => import('./track/track-routes').then(m => m.routes)
  },
  {
    path: 'search',
    loadChildren: () => import('./search-elements/search-elements-routes').then(m => m.routes)
  },
  {
    path: '**',
    redirectTo: 'recorder',
    pathMatch: 'full'
  }
];

