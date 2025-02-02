

import { HttpClient } from '@angular/common/http';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { ConfigurationService } from './core/configuration/configuration.service';

export function configurationInit(config: ConfigurationService) {
  return () => config.init();
}

// required for AOT compilation
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}
