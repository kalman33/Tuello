export function importFunc(): void {

  // le code est injecté automatiquement lors du packaging
  const code = '###IMPORTS###';


  if ((window as any).tuelloScriptLoaded !== true) {
    // on insère le code qui est la concaténation de httpmock, httprecorder et uirecorder
    const container = document.createElement('script');
    container.setAttribute('type', 'text/javascript');
    container.innerText = code;
    document.querySelector('body').appendChild(container);

    // lance la mutation observer pour surveiller le chargement d'iframe
    window['observeIframeFunc'](code);

    // permettra de valoriser l'index de l'iframe à -1
    window['TuelloFrameIndex'] = -1;

    // permet d'importer tuello qu'une seule fois
    (window as any).tuelloScriptLoaded = true;
  }

}
