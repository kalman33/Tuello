


let mockHttp = {
  originalFetch: window.fetch.bind(window),
  mockFetch: function (...args) {
    return mockHttp.originalFetch(...args).then((response) => {
      let txt = undefined;
      let status = undefined;
      if ((window as any).tuelloRecords) {
        const records = (window as any).tuelloRecords.filter(({ key, response, httpCode }) => compareWithMockLevel(args[0], key));
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
  }

};

