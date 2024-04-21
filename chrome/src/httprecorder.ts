let originalFetch = window.fetch.bind(window);

let recorderHttp = {

  recordFetch: async (...args: any[]) => {
    //const response = await recorderHttp.originalFetch(...args);
    const response = await originalFetch.apply(null, args as Parameters<typeof fetch>);
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
          let message = { ...data, ...dataForRecordHTTP };
          message = JSON.parse(JSON.stringify(message));
          window.top.postMessage(message, '*');
        }
        if (httpRecordForTagsActivated) {
          let message = { ...data, ...dataForTags };
          message = JSON.parse(JSON.stringify(message));
          window.top.postMessage(message, '*');
        }
      }

    }
    /* the original response can be resolved unmodified: */
    return response;
  }
}

let httpRecordActivated = false;
let httpRecordForTagsActivated = false;

