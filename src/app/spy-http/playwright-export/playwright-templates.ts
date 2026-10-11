/**
 * Fichiers fixes du projet Playwright généré par l'export (premier export uniquement).
 *
 * Le développeur peut les modifier une fois commités : les exports suivants (mode
 * « scénario seul ») ne les régénèrent pas.
 */

/** Version de Playwright figée dans package.json ET dans l'image Docker de la CI : elles doivent correspondre */
export const PLAYWRIGHT_VERSION = '1.61.0';

export function packageJson(): string {
  return (
    JSON.stringify(
      {
        name: 'e2e',
        private: true,
        scripts: {
          test: 'playwright test',
          'test:ui': 'playwright test --ui',
          report: 'playwright show-report',
          // Références des comparaisons visuelles, propres à chaque système (voir README)
          snapshots: 'playwright test --update-snapshots'
        },
        devDependencies: {
          '@playwright/test': PLAYWRIGHT_VERSION,
          '@types/node': '^22.10.5'
        }
      },
      null,
      2
    ) + '\n'
  );
}

export function playwrightConfig(baseUrl: string): string {
  return `import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration générée par Tuello.
 * BASE_URL permet de viser une autre adresse que celle de l'enregistrement.
 */
const baseURL = process.env.BASE_URL ?? '${baseUrl}';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'results.xml' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  // Comparaisons visuelles : animations figées ; aucune tolérance par défaut, le rendu étant
  // identique d'un passage à l'autre sur un même système (ajouter maxDiffPixels au besoin)
  expect: {
    toHaveScreenshot: { animations: 'disabled' }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Démarre l'application avant les tests (en local, réutilise celle déjà lancée).
  // À adapter si l'application ne se lance pas avec \`npm run start\` à la racine du dépôt.
  webServer: {
    command: 'npm run start',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
`;
}

export const SUPPORT_TUELLO = `// Fichier géré par Tuello : il est remplacé à chaque export, ne pas le modifier.
import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Réponse HTTP enregistrée par Tuello */
export interface BouchonTuello {
  method: string;
  /** Chemin relatif à l'application, ou URL complète pour un autre domaine */
  url: string;
  /** 0 : la requête avait échoué (réseau, annulation) */
  status: number;
  contentType?: string;
  body: unknown;
}

/** Valeur de l'état initial : texte, ou nom d'une variable d'environnement */
type ValeurEtat = string | { env: string };

/** Stockage du navigateur au démarrage de l'enregistrement */
export interface EtatTuello {
  localStorage: Record<string, ValeurEtat>;
  sessionStorage: Record<string, ValeurEtat>;
  cookies: Record<string, ValeurEtat>;
}

/** Lit un fichier d'état du dossier fixtures/ */
export function chargerEtat(fichier: string): EtatTuello {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', fichier), 'utf-8'));
}

function resoudre(valeurs: Record<string, ValeurEtat>): Record<string, string> {
  const resolu: Record<string, string> = {};
  for (const [cleValeur, valeur] of Object.entries(valeurs ?? {})) {
    if (typeof valeur === 'string') {
      resolu[cleValeur] = valeur;
    } else if (process.env[valeur.env] !== undefined) {
      resolu[cleValeur] = process.env[valeur.env] as string;
    } else {
      console.warn('[Tuello] Variable d\\'environnement ' + valeur.env + ' absente : ' + cleValeur + ' non restauré');
    }
  }
  return resolu;
}

/**
 * Restaure le stockage du navigateur (utilisateur connecté, préférences...) avant le
 * premier chargement de l'application. À appeler AVANT page.goto().
 *
 * localStorage et sessionStorage ne sont écrits qu'au premier chargement de l'onglet :
 * l'application garde ensuite la main sur leur contenu, même après un rechargement.
 */
export async function restaurerEtat(page: Page, baseURL: string | undefined, etat: EtatTuello): Promise<void> {
  const cookies = resoudre(etat.cookies);
  if (baseURL && Object.keys(cookies).length > 0) {
    await page.context().addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: baseURL })));
  }
  await page.addInitScript(
    ({ local, session }) => {
      if (window.self !== window.top || sessionStorage.getItem('__tuelloEtatRestaure')) {
        return;
      }
      for (const [k, v] of Object.entries(local)) {
        localStorage.setItem(k, v);
      }
      for (const [k, v] of Object.entries(session)) {
        sessionStorage.setItem(k, v);
      }
      sessionStorage.setItem('__tuelloEtatRestaure', '1');
    },
    { local: resoudre(etat.localStorage), session: resoudre(etat.sessionStorage) }
  );
}

/** Lit un fichier de bouchons du dossier fixtures/ */
export function chargerBouchons(fichier: string): BouchonTuello[] {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', fichier), 'utf-8'));
}

function cle(method: string, url: string): string {
  return method.toUpperCase() + ' ' + url;
}

/**
 * Rejoue les réponses enregistrées à la place du back-end. À appeler AVANT page.goto(),
 * sinon les appels du chargement partent avant d'être interceptés.
 *
 * Plusieurs réponses enregistrées pour le même appel sont servies dans l'ordre, la
 * dernière étant ensuite répétée. Un appel non enregistré part vers le réseau et est
 * signalé dans la console.
 */
export async function installerBouchons(page: Page, bouchons: BouchonTuello[]): Promise<void> {
  const reponses = new Map<string, BouchonTuello[]>();
  for (const bouchon of bouchons) {
    const k = cle(bouchon.method, bouchon.url);
    reponses.set(k, [...(reponses.get(k) ?? []), bouchon]);
  }
  const appels = new Map<string, number>();

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'xhr' && request.resourceType() !== 'fetch') {
      return route.fallback();
    }
    const url = new URL(request.url());
    const k = [cle(request.method(), url.pathname + url.search), cle(request.method(), url.href)].find((c) => reponses.has(c));
    if (!k) {
      console.warn('[Tuello] Appel non bouchonné : ' + request.method() + ' ' + request.url());
      return route.fallback();
    }
    const liste = reponses.get(k)!;
    const rang = appels.get(k) ?? 0;
    appels.set(k, rang + 1);
    const bouchon = liste[Math.min(rang, liste.length - 1)];

    if (!bouchon.status) {
      return route.abort();
    }
    if (typeof bouchon.body === 'string') {
      return route.fulfill({ status: bouchon.status, contentType: bouchon.contentType ?? 'text/plain', body: bouchon.body });
    }
    return route.fulfill({ status: bouchon.status, contentType: bouchon.contentType ?? 'application/json', body: JSON.stringify(bouchon.body ?? null) });
  });
}
`;

export function gitlabCi(): string {
  return `# Job à copier dans le .gitlab-ci.yml du dépôt (dossier e2e/ à la racine).
# La version de l'image doit rester celle de @playwright/test dans e2e/package.json.
e2e:
  stage: test
  image: mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
  script:
    - npm ci
    - cd e2e
    - npm ci
    - npx playwright test
  artifacts:
    when: always
    expose_as: 'Rapport Playwright'
    paths:
      - e2e/playwright-report/
    reports:
      junit: e2e/results.xml

# Lancement manuel : (re)génère les références des comparaisons visuelles dans l'image de
# la CI, puis les met à disposition en artefact, à commiter dans e2e/tests/.
e2e-references:
  stage: test
  image: mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
  when: manual
  allow_failure: true
  script:
    - npm ci
    - cd e2e
    - npm ci
    - npx playwright test --update-snapshots
  artifacts:
    paths:
      - e2e/tests/**/*-snapshots/
`;
}

export const README = `# Tests Playwright générés par Tuello

## Première installation

\`\`\`bash
cd e2e
npm install
npx playwright install chromium
\`\`\`

Commitez le \`package-lock.json\` créé par \`npm install\` : la CI l'utilise (\`npm ci\`).

## Lancer les tests

\`\`\`bash
npx playwright test          # tous les tests
npx playwright test --ui     # interface graphique, idéale pour déboguer
npx playwright show-report   # rapport HTML du dernier passage
\`\`\`

L'application est démarrée automatiquement (\`webServer\` dans \`playwright.config.ts\`).
Si elle tourne déjà en local, elle est réutilisée.

## Organisation

| Dossier | Contenu |
| --- | --- |
| \`tests/\` | Un fichier \`.spec.ts\` par scénario exporté |
| \`fixtures/\` | Réponses HTTP enregistrées (\`.mocks.json\`) et état initial (\`.etat.json\`) |
| \`support/tuello.ts\` | Rejeu des réponses HTTP et restauration de l'état, géré par Tuello |

Les appels HTTP de l'application sont rejoués depuis \`fixtures/\` : les tests ne dépendent
pas du back-end. Un appel absent des enregistrements est signalé dans la console.

## Lignes marquées « À vérifier »

Tuello n'a pas pu désigner l'élément de façon fiable (ancien enregistrement, élément sans
libellé) : la ligne utilise des coordonnées ou un sélecteur CSS. Remplacez-la par un
\`page.getByRole(...)\` ou ajoutez un \`data-testid\` à l'élément dans l'application.

## Mise en place et « Début du test »

Chaque test commence par un \`test.beforeEach\` qui :

1. restaure le stockage du navigateur (\`fixtures/<scenario>.etat.json\`) : utilisateur
   connecté, préférences, contexte métier ;
2. installe les réponses HTTP enregistrées ;
3. ouvre la page de départ ;
4. rejoue les actions placées avant le repère « Début du test » posé dans Tuello.

Les valeurs marquées \`{ "env": "E2E_..." }\` dans le fichier d'état sont lues dans les
variables d'environnement (variables masquées dans GitLab). Les jetons JWT « prolongés »
ont une expiration lointaine : le back-end étant bouchonné, leur signature n'est pas vérifiée.

## Comparaisons visuelles

Les captures d'écran prises pendant l'enregistrement deviennent des
\`expect(page).toHaveScreenshot()\`. Les images de référence ne viennent pas de Tuello :
elles sont produites par Playwright, et dépendent du système (polices, rendu).

- En local : \`npm run snapshots\` (références suffixées \`-darwin\` ou \`-win32\`).
- Pour la CI : lancez le job manuel \`e2e-references\`, téléchargez son artefact et
  commitez les références \`-linux\` dans \`tests/\`.

Sans référence, le premier passage échoue en indiquant qu'il vient de l'écrire.

## Mots de passe

Les saisies dans un champ mot de passe ne sont jamais exportées : elles lisent la variable
d'environnement \`E2E_PASSWORD\` (à déclarer en variable masquée dans GitLab).

## Intégration GitLab CI

Copiez le job de \`gitlab-ci.exemple.yml\` dans le \`.gitlab-ci.yml\` du dépôt.
`;
