import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { MosaicShellComponent } from '../app/mosaic/mosaic-shell/mosaic-shell.component';

bootstrapApplication(MosaicShellComponent, {
  providers: [
    provideTranslateService({
      fallbackLang: 'en',
      loader: provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: '.json'
      })
    }),
    provideAnimations(),
    provideHttpClient()
  ]
}).catch((err) => console.error(err));
