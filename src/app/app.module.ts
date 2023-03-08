import { BrowserModule } from '@angular/platform-browser';
import {APP_INITIALIZER, NgModule} from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AngularMaterialModule } from './angular-material.module';
import { RecorderHttpModule } from './recorder-http/recorder-http.module';
import { OverlayModule } from '@angular/cdk/overlay';
import { FlexLayoutModule } from '@angular/flex-layout';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import {ConfigurationService} from './core/configuration/configuration.service';
import { PlayerService } from './spy-http/services/player.service';

export function configurationInit(config: ConfigurationService) {
  return () => config.init();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,

    // ngx-translate
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),

    // Angular Material
    AngularMaterialModule,

    // flex-layout
    FlexLayoutModule,

    // Module Applicatif
    RecorderHttpModule,

    OverlayModule,
  ],
  providers: [{
    provide: APP_INITIALIZER,
    useFactory: configurationInit,
    deps: [ConfigurationService],
    multi: true
  }, PlayerService],
  
  bootstrap: [AppComponent],
})
export class AppModule {}

// required for AOT compilation
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}
