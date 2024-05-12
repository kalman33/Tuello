({
  tuello: function () {
    let deepMockLevel = 2; //'###IMPORT_DEEPMOCKLEVEL###';
    window['tuelloRecords'] = '###IMPORT_DATA###';

    function removeURLPortAndProtocol(url: string) {
      let ret = '';
      try {
        let parseURL = new URL(url);
        parseURL.port = '';
        ret = parseURL.toString();
        ret = ret.replace(/^https?:\/\//, '')
      } catch (e) {
        ret = url;
      }
      return ret;
    }

    let compareWithMockLevel = (url1, url2) => {
      if (typeof url2 !== 'string' || typeof url2 !== 'string') {
        return false;
      }
      url1 = removeURLPortAndProtocol(url1);
      url2 = removeURLPortAndProtocol(url2);
      let inc = deepMockLevel;
      // @ts-ignore
      while (inc > 0) {
        // @ts-ignore
        url1 = url1.replace(url1.split('/', inc).join('/'), '');
        // @ts-ignore
        url2 = url2.replace(url2.split('/', inc).join('/'), '');
        if (url1 && url2) {
          break;
        }
        // @ts-ignore
        inc--;
      }
      url1 = url1.replace(/^\//, '');
      url2 = url2.replace(/^\//, '');

      /**const lg1 = url1.split('/').length;
      const lg2 = url2.split('/').length;

      if (lg1 > lg2) {
        url1 = url1.split('/').slice(0, lg2).join('/');
      } else if (lg2 > lg1) {
        url2 = url2.split('/').slice(0, lg1).join('/');
      }*/

      return new RegExp('^' + url2.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*') + '$').test(url1);
    };

    const sleep = (ms: number) => {
      const stop = new Date().getTime() + ms;
      while (new Date().getTime() < stop) { }
    }


    let mockHttp = {
      originalSendXHR: window.XMLHttpRequest.prototype.send,
      originalOpenXHR: window.XMLHttpRequest.prototype.open,

      modifyResponse: (isOnLoad: boolean = false, xhr: XMLHttpRequest) => {

        if (window['tuelloRecords']) {
          // this.responseURL
          const records = window['tuelloRecords'].filter(({ key, response, httpCode }) => compareWithMockLevel(xhr["originalURL"], key));
          if (records && records.length > 0) {
            records.forEach(({ key, response, httpCode, delay }) => {
              if (delay && isOnLoad) {
                sleep(delay);
              }
              Object.defineProperty(xhr, 'response', { writable: true });
              Object.defineProperty(xhr, 'responseText', { writable: true });
              Object.defineProperty(xhr, 'status', { writable: true });
              // @ts-ignore: Ignorer l'erreur TypeScript ici
              xhr.responseText = JSON.stringify(response);
              // @ts-ignore: Ignorer l'erreur TypeScript ici
              xhr.response = response;
              // @ts-ignore: Ignorer l'erreur TypeScript ici
              xhr.status = httpCode;

            });
          }
        }
      },

      sendXHR: function (this: XMLHttpRequest) {
        const self = this;
        const realOnReadyStateChange = self.onreadystatechange;

        self.onreadystatechange = function () {
          // Vérifie si la requête est terminée (readyState === 4)
          if (self.readyState === 4) {
            mockHttp.modifyResponse(false, self);
          }

          // Appelle la fonction de rappel d'origine avec la réponse modifiée
          if (realOnReadyStateChange) {
            realOnReadyStateChange.apply(this, arguments as any);
          }
        }
        // Appel de la fonction send d'origine
        return mockHttp.originalSendXHR.apply(this, arguments as any);

      },

      openXHR: function (method, url) {
        // Permet de palier le problème de CORS : on bascule sur le même serveur
        try {
          const urlObj = new URL(url);
          urlObj.port = '';
          urlObj.password = '';
          urlObj.username = '';
          const currentURL = new URL(window.location.href); 
          url = urlObj.toString().replace(urlObj.origin, currentURL.origin);
        } catch(e) {

        }

        // Stocker l'URL dans l'objet XMLHttpRequest
        this["originalURL"] = url;

        // Appel de la fonction open d'origine pour envoyer la requête
        return mockHttp.originalOpenXHR.apply(this, arguments as any);
      },


      originalFetch: window.fetch.bind(window),
      mockFetch: function (...args) {
        return mockHttp.originalFetch(...args).then((response) => {
          let txt = undefined;
          let status = undefined;
          if (window['tuelloRecords']) {
            const records =window['tuelloRecords'].filter(({ key, response, httpCode }) => compareWithMockLevel(args[0], key));
            if (records && records.length > 0) {
              records.forEach(({ key, response, httpCode, delay }) => {
                if (delay) {
                  sleep(delay);
                }
                txt = JSON.stringify(response);
                status = httpCode;
              });
            }
          }

          if (txt !== undefined) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(txt));
                controller.close();
              }
            });

            const newResponse = new Response(stream, {
              headers: response.headers,
              status: status,
              statusText: status,
            });
            const proxy = new Proxy(newResponse, {
              get: function (target, name) {
                switch (name) {
                  case 'ok':
                  case 'redirected':
                  case 'type':
                  case 'url':
                  case 'useFinalURL':
                  case 'body':
                  case 'bodyUsed':
                    return response[name];
                }
                return target[name];
              }
            });

            for (let key in proxy) {
              if (typeof proxy[key] === 'function') {
                proxy[key] = proxy[key].bind(newResponse);
              }
            }

            return proxy;
          } else {
            return response;
          }
        });
      },

    };


    (window as any).XMLHttpRequest.prototype.open = mockHttp.openXHR;
    (window as any).XMLHttpRequest.prototype.send = mockHttp.sendXHR;
    (window as any).fetch = mockHttp.mockFetch;
  }
})['tuello']();
