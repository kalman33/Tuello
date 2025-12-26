
import { enableProdMode, importProvidersFrom, inject, provideAppInitializer } from '@angular/core';

import { OverlayModule } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app/app-routes';
import { AppComponent } from './app/app.component';
import { ConfigurationService } from './app/core/configuration/configuration.service';
import { PlayerService } from './app/spy-http/services/player.service';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

function configurationInit(config: ConfigurationService) {
    return () => config.init();
  }

bootstrapApplication(AppComponent, {
    providers: [
        provideTranslateService({
            loader: provideTranslateHttpLoader({
                prefix: './assets/i18n/',
                suffix: '.json'
            }),
        }),
        provideRouter(routes),
        importProvidersFrom(BrowserModule,
        // flex-layout
        FlexLayoutModule,
        // Module Applicatif
        OverlayModule),
        provideAppInitializer(() => {
        const initializerFn = (configurationInit)(inject(ConfigurationService));
        return initializerFn();
      }), PlayerService,
        provideAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
    ]
})
  .catch(err => console.error(err));
