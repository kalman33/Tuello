
/**
 * permet de réaliser un post message de devtools vers les fichiers importés dans l'application
 */
export function postMessage(msg: any) {

  const msgStr = JSON.stringify(msg);

  chrome.devtools.inspectedWindow.eval(
    `window.postMessage(
     ${msgStr},
      '*'
    )`,
    (result, isException) => {
      
    },
  );
}
