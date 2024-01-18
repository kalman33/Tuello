 function removeURLPort(url) {
    let ret = '';
    try {
      let parseURL = new URL(url);
      parseURL.port = '';
      ret = parseURL.toString();
    } catch(e) {
      ret = url;
    }
    return ret;
  }

let compareWithMockLevel = (url1, url2) => {
    url1 = removeURLPort(url1);
    url2 = removeURLPort(url2);
    if (deepMockLevel === 0) {
      return new RegExp('^' + url2.replaceAll(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replaceAll('*', '(.*)') + '$').test(url1);
    } else {
      let cmp1;
      let cmp2;
      for (const inc of [2, 1, 0]) {
        cmp1 = url1.replace(url1.split('/', deepMockLevel + inc).join('/'), '');
        cmp2 = url2.replace(url2.split('/', deepMockLevel + inc).join('/'), '');
        if (cmp1) {
          break;
        }
      }
      return new RegExp('^' + cmp2.replaceAll(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replaceAll('*', '(.*)') + '$').test(cmp1);
    }
  };
  
  const sleep = (ms) => {
    const stop = new Date().getTime() + ms;
    while (new Date().getTime() < stop){}
  }
  
  
  let mockHttp = {
    originalXHR: window.XMLHttpRequest,
    mockXHR() {
      // URL avant redirect
      let originalURL; 
  
      const modifyResponse = (isOnLoad = false) => {
        if (window.mmaRecords) {
          // this.responseURL
          const records = window.mmaRecords.filter(({ key, reponse, httpCode }) => compareWithMockLevel(originalURL, key));
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
        if (window.mmaRecords) {
          const records = window.mmaRecords.filter(({ key, reponse, httpCode }) => compareWithMockLevel(args[0], key));
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
  

const deepMockLevel = '###IMPORT_DEEPMOCKLEVEL###';
window.XMLHttpRequest = mockHttp.mockXHR;
window.fetch - mockHttp.mockFetch;
window.tuelloRecords = '###IMPORT_DATA###';
     