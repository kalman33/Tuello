

let recorderHttp = {

  originalXHR: window.XMLHttpRequest,
  recordXHR() {

    let xhrBody;
    let xhrMethod;
    // URL avant redirect
    let originalURL;
    const xhr = new recorderHttp.originalXHR();

    // tslint:disable-next-line:forin
    for (const attr in xhr) {

      if (attr === 'onreadystatechange') {
        xhr.onreadystatechange = (...args) => {
          if (this.readyState === 4) {
            if (this.responseURL && typeof this.responseURL === 'string' && !this.responseURL.includes('tuello') && !this.responseURL.includes('sockjs')) {
              let reponse = '';
              try {
                reponse = JSON.parse(this.response);
                
              } catch (e) {
                reponse = this.response;
                // error
                console.log('Tuello : Problème de parsing de la reponse', e);
              }
              window.postMessage(
                {
                  type: 'RECORD_HTTP',
                  url: this.responseURL,
                  delay: 0,
                  response: reponse,
                  status: this.status,
                  method: xhrMethod,
                  body: xhrBody,
                  hrefLocation: window.location.href
                },
                '*',
              );
            }
          }
          // tslint:disable-next-line:no-unused-expression
          this.onreadystatechange && this.onreadystatechange.apply(this, args);
        };
        continue;
      } else if (attr === 'onload') {
        xhr.onload = (...args) => {
          
          this.onload && this.onload.apply(this, args);
        }
        continue;
      }

      if (typeof xhr[attr] === 'function') {
        if (attr === 'open') {
          const open = xhr[attr].bind(xhr);
          this[attr] = function (method, url) {
            xhrMethod = method;
            originalURL = url;
            open.call(this, method, url);
          }
        } else if (attr === 'send') {
          const send = xhr[attr].bind(xhr);
          this[attr] = function (data) {

            // xhrBody = getBodyFromData(data);
            //console.log('TUELLO DATA', xhrBody);

            send.call(this, data);
          }
        } else {
          this[attr] = xhr[attr].bind(xhr);
        }
      } else {
        if (attr === 'responseText' || attr === 'response' || attr === 'status' || attr === 'statusText') {
          Object.defineProperty(this, attr, {
            get: () => this[`_${attr}`] == undefined ? xhr[attr] : this[`_${attr}`],
            set: (val) => this[`_${attr}`] = val,
            enumerable: true
          });
        } else {
          Object.defineProperty(this, attr, {
            get: () => xhr[attr],
            set: (val) => xhr[attr] = val,
            enumerable: true
          });
        }
      }
    }
  },
  originalFetch: window.fetch.bind(window),
  recordFetch: async (...args) => {

    const response = await recorderHttp.originalFetch(...args);
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
        (window as any).XMLHttpRequest = recorderHttp.recordXHR;
        window.fetch = recorderHttp.recordFetch;
      } else {
        (window as any).XMLHttpRequest = recorderHttp.originalXHR;
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

