
let deepMockLevel = 0;

let compareWithMockLevel = (url1, url2) => {
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
  url1 = url1.substring(0, 1) === '/' ? url1.substring(1) : url1;
  url2 = url2.substring(0, 1) === '/' ? url2.substring(1) : url2;
  const lg1 = url1.split('/').length;
  const lg2 = url2.split('/').length;
  if (lg1 > lg2) {
    url1 = url1.replace(url1.split('/', (lg1-lg2)).join('/'), '');
  } else if (lg2 > lg1) {
    url2 = url2.replace(url2.split('/', (lg2-lg1)).join('/'), '');
  }
  url1 = url1.substring(0, 1) === '/' ? url1.substring(1) : url1;
  url2 = url2.substring(0, 1) === '/' ? url2.substring(1) : url2;
  return new RegExp('^' + url2.replaceAll(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replaceAll('*', '(.*)') + '$').test(url1);
};

const sleep = (ms: number) => {
  const stop = new Date().getTime() + ms;
  while (new Date().getTime() < stop){}
}


let mockHttp = {
  originalXHR: window.XMLHttpRequest,
  mockXHR() {
    // URL avant redirect
    let originalURL; 

    const modifyResponse = (isOnLoad: boolean = false) => {
      if ((window as any).tuelloRecords) {
        // this.responseURL
        const records = (window as any).tuelloRecords.filter(({ key, reponse, httpCode }) => compareWithMockLevel(originalURL, key));
        if (records && records.length > 0) {
          records.forEach(({ key, reponse, httpCode, delay }) => {
            if (delay && isOnLoad) {
              sleep(delay);
            }
            this.responseText = JSON.stringify(reponse);
            // Object.defineProperty(this,'responseText', JSON.stringify(reponse));
            this.response = reponse;
            this.status = httpCode;
          });
        }
      }
    };

   

    const xhr = new mockHttp.originalXHR();
    // tslint:disable-next-line:forin
    for (const attr in xhr) {
      if (attr === 'onreadystatechange') {
        xhr.onreadystatechange = (...args) => {
          if (this.readyState === 4) {
            modifyResponse();
          }
          // tslint:disable-next-line:no-unused-expression
          this.onreadystatechange && this.onreadystatechange.apply(this, args);
        };
        continue;
      } else if (attr === 'onload') {
        xhr.onload = (...args) => {
          if (this.readyState === 4) {
            modifyResponse(true);
          }
          this.onload && this.onload.apply(this, args);
        };
        continue;
      }
      if (typeof xhr[attr] === 'function') {
        if (attr === 'open') {
          const open = xhr[attr].bind(xhr);
          this[attr] =  function(method, url) {
            originalURL = url;
            open.call(this, method, url);
          }
        } else {
          this[attr] = xhr[attr].bind(xhr);
        }
      } else {
        if (attr === 'responseText' || attr === 'response' || attr === 'status') {
          Object.defineProperty(this, attr, {
            get: () => (this[`_${attr}`] === undefined ? xhr[attr] : this[`_${attr}`]),
            set: val => (this[`_${attr}`] = val),
            enumerable: true,
          });
        } else {
          Object.defineProperty(this, attr, {
            get: () => xhr[attr],
            set: val => (xhr[attr] = val),
            enumerable: true,
          });
        }
      }
    }
  },

  originalFetch: window.fetch.bind(window),
  mockFetch: function(...args) {
    return mockHttp.originalFetch(...args).then((response) => {
      let txt = undefined;
      let status = undefined;
      if ((window as any).tuelloRecords) {
        const records = (window as any).tuelloRecords.filter(({ key, reponse, httpCode }) => compareWithMockLevel(args[0], key));
        if (records && records.length > 0) {
          records.forEach(({ key, reponse, httpCode, delay }) => {
            if (delay) {
              sleep(delay);
            }
            txt = JSON.stringify(reponse);
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
          get: function(target, name){
            switch(name) {
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

/**
 * Listener des post message provenant de contentscript
 */
window.addEventListener(
  'message',
  // tslint:disable-next-line:only-arrow-functions
  function(event) {
    if (event?.data?.type && event?.data?.type === 'MOCK_HTTP_ACTIVATED') {
      if (event.data.value) {
        deepMockLevel = event.data.deepMockLevel || 0;
        (window as any).XMLHttpRequest = mockHttp.mockXHR;
        window.fetch = mockHttp.mockFetch;
        (window as any).tuelloRecords = event.data.tuelloRecords;
      } else {
        window.XMLHttpRequest = mockHttp.originalXHR;
        window.fetch = mockHttp.originalFetch;
      }
    } // else ignore messages seemingly not sent to yourself
  },
  false,
);

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

// indique au contenscript qu'il s'est chargé
window.postMessage(
  {
    type: 'RECORD_MOCK_READY',
  },
  '*',
);
