# Modification au niveau de node_modules/resemblejs/resemble.js

```
var isNode = function () {
    //const globalPolyfill = getGlobalThis();
    //return typeof globalPolyfill.process !== "undefined" && globalPolyfill.process.versions && globalPolyfill.process.versions.node;
    return true;
};
```

obligé de modifer en return true car sinon resemble.js plante dans le service worker car il crée un canvas dans le dom. Or il n'a pas acces au dom.