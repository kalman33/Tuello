let recorderHttp = {

  originalSendXHR: window.XMLHttpRequest.prototype.send,
  originalOpenXHR: window.XMLHttpRequest.prototype.open,

  xhrMethod: null as string | null,
  xhrBody: null as string | null,

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
              status: this.status,
              method: recorderHttp.xhrMethod || '',
              body: recorderHttp.xhrBody, // non utilisé
              hrefLocation: window.location.href
            },
            '*',
          );
        }

        // Appelle la fonction de rappel d'origine avec la réponse modifiée
        if (realOnReadyStateChange) {
          realOnReadyStateChange.apply(this, arguments as any);
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

    // Ajout de la méthode et de l'URL à l'objet recorderHttp
    recorderHttp.xhrMethod = method;

    // Appel de la fonction open d'origine pour envoyer la requête
    return recorderHttp.originalOpenXHR.apply(this, arguments as any);
  },
  originalFetch: window.fetch.bind(window),
  recordFetch: async (...args: any[]) => {

    //const response = await recorderHttp.originalFetch(...args);
    const response = await recorderHttp.originalFetch.apply(null, args as Parameters<typeof fetch>);
    let data: any;
    if (args[0] && typeof args[0] === 'string') {
      data =
      {
        type: 'RECORD_HTTP',
        url: args[0],
        delay: 0,
        status: response.status,
        method: args[1] ? args[1].method : "GET",
        body: args[1] ? args[1].body : undefined,
        hrefLocation: window.location.href
      };

      /* work with the cloned response in a separate promise
         chain -- could use the same chain with `await`. */
      response
        .clone()
        .json()
        .then(body => data = {
          ...data,
          response: body
        })
        .catch(err => data = {
          ...data,
          response: err
        })
        .finally(() => {
          const obj = JSON.parse(JSON.stringify(data));
          window.postMessage(
            obj
            ,
            '*',
          );
        });

    }
    /* the original response can be resolved unmodified: */
    return response;
  }
}

/**
 * Listener des post message provenant de contentscript
 */
window.addEventListener(
  'message',
  // tslint:disable-next-line:only-arrow-functions
  function (event) {
    if (event?.data?.type && event?.data?.type === 'RECORD_HTTP_ACTIVATED') {
      if (event.data.value) {
        (window as any).XMLHttpRequest.prototype.open = recorderHttp.openXHR;
        (window as any).XMLHttpRequest.prototype.send = recorderHttp.sendXHR;

        window.fetch = recorderHttp.recordFetch;
      } else {
        (window as any).XMLHttpRequest.prototype.open = recorderHttp.originalOpenXHR;
        (window as any).XMLHttpRequest.prototype.send = recorderHttp.originalSendXHR;
        window.fetch = recorderHttp.originalFetch;
      }
    } // else ignore messages seemingly not sent to yourself
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

