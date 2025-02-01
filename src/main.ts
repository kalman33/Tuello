
import { enableProdMode, APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { configurationInit, HttpLoaderFactory } from './app/app.module';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { OverlayModule } from '@angular/cdk/overlay';
import { RecorderHttpModule } from './app/recorder-http/recorder-http.module';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { withInterceptorsFromDi, provideHttpClient, HttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app/app-routing.module';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { PlayerService } from './app/spy-http/services/player.service';
import { ConfigurationService } from './app/core/configuration/configuration.service';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(BrowserModule, AppRoutingModule, TranslateModule.forRoot({
            loader: {
                provide: TranslateLoader,
                useFactory: HttpLoaderFactory,
                deps: [HttpClient],
            },
        }), 
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
