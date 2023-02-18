import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: 'recorder',
    loadChildren: () => import('./recorder-http/recorder-http.module').then(m => m.RecorderHttpModule)

  },
  {
    path: 'settings',
    loadChildren: () => import('./settings/settings.module').then(m => m.SettingsModule)
  },
  {
    path: 'spy',
    loadChildren: () => import('./spy-http/spy-http.module').then(m => m.SpyHttpModule)
  },
  {
    path: 'track',
    loadChildren: () => import('./track/track.module').then(m => m.TrackModule)
  },
  {
    path: 'search',
    loadChildren: () => import('./search-elements/search-elements.module').then(m => m.SearchElementsModule)
  },
  {
    path: '**',
    redirectTo: 'recorder',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
