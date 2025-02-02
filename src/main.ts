
import { APP_INITIALIZER, enableProdMode, importProvidersFrom } from '@angular/core';

import { OverlayModule } from '@angular/cdk/overlay';
import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { HttpLoaderFactory, configurationInit } from './app/app.module';
import { ConfigurationService } from './app/core/configuration/configuration.service';
import { RecorderHttpModule } from './app/recorder-http/recorder-http.module';
import { PlayerService } from './app/spy-http/services/player.service';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
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
        importProvidersFrom(BrowserModule, AppRoutingModule, 
        // flex-layout
        FlexLayoutModule, 
        // Module Applicatif
        RecorderHttpModule, OverlayModule),
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
