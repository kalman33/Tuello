let httpCalls = new Map<string, any>();
let originalFetch = window.fetch.bind(window);

let recorderHttp = {

  originalSendXHR: window.XMLHttpRequest.prototype.send,
  originalOpenXHR: window.XMLHttpRequest.prototype.open,

  sendXHR: function (this: XMLHttpRequest) {
    const self = this;
    const realOnReadyStateChange = self.onreadystatechange;

    self.onreadystatechange = function () {
      // Vérifie si la requête est terminée (readyState === 4)
      if (self.readyState === 4) {
        if (self.responseURL && typeof self.responseURL === 'string' && !self.responseURL.includes('tuello') && !self.responseURL.includes('sockjs')) {
          let reponse = '';
          try {
            reponse = JSON.parse(self.responseText);

          } catch (e) {
            reponse = self.responseText;
            // error
            console.log('Tuello : Problème de parsing de la reponse', e);
          }
          window.postMessage(
            {
              type: 'RECORD_HTTP',
              url: self.responseURL,
              delay: 0,
              response: reponse,
              status: self.status,
              method: self['xhrMethod'] || '',
              hrefLocation: window.location.href
            },
            '*',
          );
        }
      }
      if (realOnReadyStateChange) {
        realOnReadyStateChange.apply(this, arguments as any);
      }

    };

    // Appel de la fonction send d'origine
    return recorderHttp.originalSendXHR.apply(this, arguments as any);

  },

  openXHR: function (method, url) {

    // Stocker l'URL dans l'objet XMLHttpRequest
    this["xhrMethod"] = method;

    // Appel de la fonction open d'origine pour envoyer la requête
    return recorderHttp.originalOpenXHR.apply(this, arguments as any);
  },


  recordFetch: async (...args: any[]) => {

    //const response = await recorderHttp.originalFetch(...args);
    const response = await originalFetch.apply(window, args as Parameters<typeof fetch>);
    if (args[0] && typeof args[0] === 'string') {
      let dataForRecordHTTP: any = 
      {
        type: 'RECORD_HTTP',
        url: args[0],
        delay: 0,
        status: response.status,
        method: args[1] ? args[1].method : "GET",
        body: args[1] ? args[1].body : undefined,
        hrefLocation: window.location.href
      };
      let dataForTags: any = { url: args[0], type: 'ADD_HTTP_CALL_FOR_TAGS' };
      let data: any = {};

      try {
        // Essayer de lire le corps de la réponse en tant que JSON
        const responseBody = await response.clone().json();
        data.response = responseBody;
      } catch (error) {
        // En cas d'erreur, enregistrer l'erreur dans response
        data.response = error
      } finally {
        // Envoyer le message contenant les données enregistrées
        //const message = JSON.parse(JSON.stringify(data));
        if (httpRecordActivated) {
          const message = { ...data, ...dataForRecordHTTP };
          window.top.postMessage(message, '*');
        }
        if (httpRecordForTagsActivated) {
          const message = { ...data, ...dataForTags };
          window.top.postMessage(message, '*');
        }


        
      }

    }
    /* the original response can be resolved unmodified: */
    return response;
  }
}

let recorderHttpForTags = {
  originalSendXHR: window.XMLHttpRequest.prototype.send,

  sendXHR: function () {
    const self = this;
    const realOnReadyStateChange = self.onreadystatechange;

    self.onreadystatechange = function () {
      // Vérifie si la requête est terminée (readyState === 4)
      if (self.readyState === 4) {

        window.top.postMessage({
          type: 'ADD_HTTP_CALL_FOR_TAGS',
          url: self.responseURL,
          response: self.responseText
        }, '*');
      }
      if (realOnReadyStateChange) {
        realOnReadyStateChange.apply(self, arguments);
      }
    };

    // Appel de la fonction send d'origine
    return recorderHttpForTags.originalSendXHR.apply(this, arguments);
  },

  recordFetch: async (...args: any[]) => {

    //const response = await recorderHttp.originalFetch(...args);
    const response = await originalFetch.apply(window, args as Parameters<typeof fetch>);
    if (args[0] && typeof args[0] === 'string') {
      let data: any = { url: args[0] };

      try {
        // Essayer de lire le corps de la réponse en tant que JSON
        const responseBody = await response.clone().json();
        data.response = responseBody;
      } catch (error) {
        // En cas d'erreur, enregistrer l'erreur dans response
        data.response = error
      } finally {
        // Envoyer le message contenant les données enregistrées
        const message = { ...data, type: 'ADD_HTTP_CALL_FOR_TAGS' };
        window.top.postMessage(message, '*');
      }

    }
    /* the original response can be resolved unmodified: */
    return response;
  }
};

function combineInterceptors(...interceptors) {
  return async (...args) => {
    let result = args;
    for (const interceptor of interceptors) {
      result = await interceptor(...result);
    }
    return result;
  };
}

let httpRecordActivated = false;
let httpRecordForTagsActivated = false;

/**
 * Listener des post message provenant de contentscript
 */
window.addEventListener(
  'message',
  // tslint:disable-next-line:only-arrow-functions
  function (event) {
    if (event?.data?.type === 'RECORD_HTTP_ACTIVATED' || event?.data?.type === 'RECORD_HTTP_CALL_FOR_TAGS') {
      if (event?.data?.type === 'RECORD_HTTP_ACTIVATED') {
        if (event.data.value) {
          (window as any).XMLHttpRequest.prototype.open = recorderHttp.openXHR;
          (window as any).XMLHttpRequest.prototype.send = recorderHttp.sendXHR;
          httpRecordActivated = true;
        } else {
          (window as any).XMLHttpRequest.prototype.open = recorderHttp.originalOpenXHR;
          (window as any).XMLHttpRequest.prototype.send = recorderHttp.originalSendXHR;
          httpRecordActivated = false;
        }
      } else {
        // on active l'intercepteur HTTP
        (window as any).XMLHttpRequest.prototype.send = recorderHttpForTags.sendXHR;
        httpRecordForTagsActivated = true;
      } 
      if (httpRecordActivated || httpRecordForTagsActivated) {
        window.fetch = recorderHttp.recordFetch;
      } else {
        window.fetch = originalFetch;
      }
      
    }
  },
  false,
);

// indique au contenscript qu'il s'est chargé
window.postMessage(
  {
    type: 'RECORD_HTTP_READY',
  },
  '*',
);

