
import { APP_INITIALIZER, enableProdMode, importProvidersFrom } from '@angular/core';

import { OverlayModule } from '@angular/cdk/overlay';
import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { routes } from './app/app-routes';
import { AppComponent } from './app/app.component';
import { ConfigurationService } from './app/core/configuration/configuration.service';
import { PlayerService } from './app/spy-http/services/player.service';
import { environment } from './environments/environment';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

if (environment.production) {
  enableProdMode();
}

function configurationInit(config: ConfigurationService) {
    return () => config.init();
  }
  
  // required for AOT compilation
 function HttpLoaderFactory(http: HttpClient) {
    return new TranslateHttpLoader(http);
  }

bootstrapApplication(AppComponent, {
    providers: [
        provideTranslateService({
            loader: {
                provide: TranslateLoader,
                useFactory: HttpLoaderFactory,
                deps: [HttpClient],
            },
        }),
        provideRouter(routes),
        importProvidersFrom(BrowserModule,
        // flex-layout
        FlexLayoutModule, 
        // Module Applicatif
        OverlayModule),
        {
            provide: APP_INITIALIZER,
            useFactory: configurationInit,
            deps: [ConfigurationService],
            multi: true
        }, PlayerService,
        provideAnimations(),
        provideHttpClient(withInterceptorsFromDi()),
    ]
})
  .catch(err => console.error(err));
