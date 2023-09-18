let compareWithMockLevel = (url1, url2) => {
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

  var mockHttp = {
    originalXHR: window.XMLHttpRequest,
    mockXHR: function () {
        var _this = this;
        // URL avant redirect
        var originalURL;
        var modifyResponse = function () {
            if (window.mmaRecords) {
                // this.responseURL
                var records = window.mmaRecords.filter(function (_a) {
                    var key = _a.key, reponse = _a.reponse, httpCode = _a.httpCode;
                    return compareWithMockLevel(originalURL, key);
                });
                if (records && records.length > 0) {
                    records.forEach(function (_a) {
                        var key = _a.key, reponse = _a.reponse, httpCode = _a.httpCode;
                        _this.responseText = JSON.stringify(reponse);
                        // Object.defineProperty(this,'responseText', JSON.stringify(reponse));
                        _this.response = reponse;
                        _this.status = httpCode;
                    });
                }
            }
        };
        var xhr = new mockHttp.originalXHR();
        var _loop_1 = function (attr) {
            if (attr === 'onreadystatechange') {
                xhr.onreadystatechange = function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    if (_this.readyState === 4) {
                        modifyResponse();
                    }
                    // tslint:disable-next-line:no-unused-expression
                    _this.onreadystatechange && _this.onreadystatechange.apply(_this, args);
                };
                return "continue";
            }
            else if (attr === 'onload') {
                xhr.onload = function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    if (_this.readyState === 4) {
                        modifyResponse();
                    }
                    _this.onload && _this.onload.apply(_this, args);
                };
                return "continue";
            }
            if (typeof xhr[attr] === 'function') {
                if (attr === 'open') {
                    var open_1 = xhr[attr].bind(xhr);
                    this_1[attr] = function (method, url) {
                        originalURL = url;
                        open_1.call(this, method, url);
                    };
                }
                else {
                    this_1[attr] = xhr[attr].bind(xhr);
                }
            }
            else {
                if (attr === 'responseText' || attr === 'response' || attr === 'status') {
                    Object.defineProperty(this_1, attr, {
                        get: function () { return (_this["_".concat(attr)] === undefined ? xhr[attr] : _this["_".concat(attr)]); },
                        set: function (val) { return (_this["_".concat(attr)] = val); },
                        enumerable: true,
                    });
                }
                else {
                    Object.defineProperty(this_1, attr, {
                        get: function () { return xhr[attr]; },
                        set: function (val) { return (xhr[attr] = val); },
                        enumerable: true,
                    });
                }
            }
        };
        var this_1 = this;
        // tslint:disable-next-line:forin
        for (var attr in xhr) {
            _loop_1(attr);
        }
    },
    originalFetch: window.fetch.bind(window),
    mockFetch: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return mockHttp.originalFetch.apply(mockHttp, args).then(function (response) {
            var txt = undefined;
            var status = undefined;
            if (window.mmaRecords) {
                var records = window.mmaRecords.filter(function (_a) {
                    var key = _a.key, reponse = _a.reponse, httpCode = _a.httpCode;
                    return compareWithMockLevel(args[0], key);
                });
                if (records && records.length > 0) {
                    records.forEach(function (_a) {
                        var key = _a.key, reponse = _a.reponse, httpCode = _a.httpCode;
                        txt = JSON.stringify(reponse);
                        status = httpCode;
                    });
                }
            }
            if (txt !== undefined) {
                var stream = new ReadableStream({
                    start: function (controller) {
                        controller.enqueue(new TextEncoder().encode(txt));
                        controller.close();
                    }
                });
                var newResponse = new Response(stream, {
                    headers: response.headers,
                    status: status,
                    statusText: status,
                });
                var proxy = new Proxy(newResponse, {
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
                for (var key in proxy) {
                    if (typeof proxy[key] === 'function') {
                        proxy[key] = proxy[key].bind(newResponse);
                    }
                }
                return proxy;
            }
            else {
                return response;
            }
        });
    },
};

const deepMockLevel = '###IMPORT_DEEPMOCKLEVEL###';
window.XMLHttpRequest = mockHttp.mockXHR;
window.fetch - mockHttp.mockFetch;
window.tuelloRecords = '###IMPORT_DATA###';
     