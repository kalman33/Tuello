import { BrowserModule } from '@angular/platform-browser';
import {APP_INITIALIZER, NgModule} from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { RecorderHttpModule } from './recorder-http/recorder-http.module';
import { OverlayModule } from '@angular/cdk/overlay';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import {ConfigurationService} from './core/configuration/configuration.service';
import { PlayerService } from './spy-http/services/player.service';

export function configurationInit(config: ConfigurationService) {
  return () => config.init();
}



// required for AOT compilation
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}
