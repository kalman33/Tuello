/**
 * @file
 * Intercepteur de requêtes pour afficher un indicateur visuel à l'utilisateur.
 */
import { Injectable } from '@angular/core';
import { RecorderHttpService } from '../services/recorder-http.service';

/**
 * Permet de démarrer/arrêter le loader pour chaque requête HTTP en cours
 */
@Injectable({
  providedIn: 'root',
})
export class RecorderHttpInterceptorService {
  constructor(private recorderService: RecorderHttpService) {
   

  }
  /**
  interceptXHR(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      filter(event => event.type !== 0),
      tap(
        (event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            // permet de gérer api/map, le userprofile et la configurations
            let url = req.url;
            if (url.indexOf('/../api') >= 0) {
              url = url.substring(url.indexOf('/../api'));
            }
            this.recorderService.addRecord(url, { data: event.body, status: event.status });
          }
        },
        (err: HttpErrorResponse) => {
          // permet de gérer api/map, le userprofile et la configurations
          let url = req.url;
          if (url.indexOf('/../api') >= 0) {
            url = url.substring(url.indexOf('/../api'));
          }
          this.recorderService.addRecord(url, { status: err.status, erreur: err.error });
        }
      )
    );
  }
 */
}
