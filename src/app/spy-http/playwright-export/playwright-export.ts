/**
 * Export d'un enregistrement Spy & Replay en test Playwright.
 *
 * Fonctions pures : l'enregistrement en entrée, la liste des fichiers à produire en
 * sortie. Rien n'est modifié dans l'enregistrement, le rejeu et le rapport Tuello ne
 * sont donc pas concernés.
 */
import { ITargetDescriptor } from '../../../../chrome/src/models/TargetDescriptor';
import { ZipEntry } from '../../core/utils/zip';
import { HttpReturn } from '../../recorder-http/models/http.return';
import { Action } from '../models/Action';
import { ActionType } from '../models/ActionType';
import { Record } from '../models/Record';
import { IUserAction } from '../models/UserAction';
import { buildStateFile, StateEntry } from './initial-state-export';
import { gitlabCi, packageJson, playwrightConfig, README, SUPPORT_TUELLO } from './playwright-templates';

export type ExportMode = 'full' | 'scenario';

export interface ExportOptions {
  testName: string;
  mode: ExportMode;
  /** Clés de l'état initial et leur traitement (voir initial-state-export.ts) */
  stateEntries?: StateEntry[];
}

/** Problème détecté avant l'export ; `code` sert de clé de traduction */
export interface ExportIssue {
  code: 'not-local' | 'no-start-url' | 'no-action' | 'iframe' | 'coordinates' | 'image' | 'screenshot' | 'other-domain' | 'password' | 'no-test-start' | 'no-assertion';
  count?: number;
  detail?: string;
}

export interface ExportAnalysis {
  blocking: ExportIssue[];
  warnings: ExportIssue[];
}

/** Bouchon tel qu'écrit dans fixtures/<scenario>.mocks.json (format lu par support/tuello.ts) */
interface MockEntry {
  method: string;
  url: string;
  status: number;
  contentType?: string;
  body: unknown;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];

const FIELD_TAGS = ['input', 'select', 'textarea'];

/** Rôles acceptés par le typage de `page.getByRole` : un rôle inventé ne compilerait pas */
const ARIA_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'heading',
  'treeitem',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'row',
  'combobox',
  'listbox',
  'textbox',
  'searchbox',
  'spinbutton',
  'slider',
  'img',
  'listitem',
  'dialog',
  'menu',
  'navigation',
  'tabpanel'
];

/** Champs dont l'évènement `input` suit un clic déjà exporté : ils ne se « remplissent » pas */
const NON_TEXT_INPUTS = ['checkbox', 'radio', 'file'];

/** Évènements sans équivalent utile dans un test : Playwright fait défiler et attend tout seul */
const IGNORED_EVENTS = ['scroll', 'resize'];

/**
 * @param extraHosts hôtes locaux déclarés dans les Paramètres (`local.monapp.fr` pointant
 * sur la machine via le fichier hosts, par exemple)
 */
export function isLocalHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.toLowerCase();
  return LOCAL_HOSTS.includes(host) || host.endsWith('.localhost') || extraHosts.some((extra) => extra.trim().toLowerCase() === host);
}

/** Une action d'iframe désigne un élément d'une autre application : hors périmètre */
function isInIframe(userAction: IUserAction | null | undefined): boolean {
  const frame = userAction?.frame;
  if (!frame) {
    return false;
  }
  if (frame.frameIndex !== undefined && frame.frameIndex !== null) {
    return frame.frameIndex !== -1;
  }
  return (frame.frameId ?? 0) !== 0;
}

/** URL de départ : celle de la première action qui en porte une (la navigation initiale) */
export function findStartUrl(record: Record): URL | null {
  const href = record?.actions?.find((action) => !!action?.userAction?.hrefLocation)?.userAction.hrefLocation;
  if (!href) {
    return null;
  }
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** Chemin relatif si l'URL est sur l'application testée, URL complète sinon */
function relativize(url: string, start: URL): string | null {
  try {
    const parsed = new URL(url, start);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin === start.origin ? parsed.pathname + parsed.search + parsed.hash : parsed.href;
  } catch {
    return null;
  }
}

function exportedHttpRecords(record: Record): HttpReturn[] {
  return [...(record?.httpRecords ?? [])].filter((http) => !!http?.key).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

/** Chaîne JavaScript entre apostrophes */
function q(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
}

function nth(rank: number | undefined): string {
  return typeof rank === 'number' ? `.nth(${rank})` : '';
}

/**
 * Désignation Playwright de l'élément, de la plus robuste à la plus fragile.
 * null si rien ne permet de le désigner autrement que par ses coordonnées.
 */
export function locatorFor(target: ITargetDescriptor | undefined, fallbackSelector?: string): string | null {
  if (target?.testId) {
    return `page.getByTestId(${q(target.testId)})`;
  }
  const isField = !!target && FIELD_TAGS.includes(target.tag);
  if (isField && target.label) {
    return `page.getByLabel(${q(target.label)}, { exact: true })`;
  }
  if (isField && target.placeholder) {
    return `page.getByPlaceholder(${q(target.placeholder)}, { exact: true })`;
  }
  if (target?.role && target.name && ARIA_ROLES.includes(target.role)) {
    return `page.getByRole(${q(target.role)}, { name: ${q(target.name)}, exact: true })${nth(target.roleNth)}`;
  }
  if (target?.text) {
    return `page.getByText(${q(target.text)}, { exact: true })${nth(target.textNth)}`;
  }
  const selector = target?.selector || fallbackSelector;
  if (selector) {
    return `page.locator(${q(selector)})`;
  }
  return null;
}

function addCount(counts: Map<ExportIssue['code'], number>, code: ExportIssue['code']): void {
  counts.set(code, (counts.get(code) ?? 0) + 1);
}

/** Contrôles avant export : bloquants (export impossible) et avertissements */
export function analyzeRecord(record: Record, extraHosts: string[] = []): ExportAnalysis {
  const blocking: ExportIssue[] = [];
  const warnings: ExportIssue[] = [];

  const start = findStartUrl(record);
  if (!start) {
    blocking.push({ code: 'no-start-url' });
  } else if (!isLocalHost(start.hostname, extraHosts)) {
    blocking.push({ code: 'not-local', detail: start.host });
  }

  const counts = new Map<ExportIssue['code'], number>();
  let exportable = 0;
  let assertions = 0;
  let hasTestStart = false;
  for (const action of record?.actions ?? []) {
    if (!action) {
      continue;
    }
    if (isInIframe(action.userAction)) {
      addCount(counts, 'iframe');
      continue;
    }
    switch (action.actionType) {
      case ActionType.EVENT: {
        const userAction = action.userAction;
        if (!userAction || IGNORED_EVENTS.includes(userAction.type)) {
          break;
        }
        exportable++;
        if (userAction.type === 'click' && !locatorFor(userAction.target)) {
          addCount(counts, 'coordinates');
        }
        if (userAction.type === 'input' && userAction.target?.inputType === 'password') {
          addCount(counts, 'password');
        }
        break;
      }
      case ActionType.RECORD_BY_LABEL:
        exportable++;
        break;
      case ActionType.RECORD_BY_IMAGE:
        addCount(counts, 'image');
        break;
      case ActionType.SCREENSHOT:
        addCount(counts, 'screenshot');
        break;
      case ActionType.ASSERTION:
        assertions++;
        break;
      case ActionType.TEST_START:
        hasTestStart = true;
        break;
      default:
        break;
    }
  }
  if (exportable === 0) {
    blocking.push({ code: 'no-action' });
  }
  for (const code of ['iframe', 'coordinates', 'password', 'image', 'screenshot'] as ExportIssue['code'][]) {
    if (counts.get(code)) {
      warnings.push({ code, count: counts.get(code) });
    }
  }
  // Conseils plutôt que problèmes : un test sans vérification ne contrôle que l'absence d'erreur
  if (exportable > 0 && assertions === 0) {
    warnings.push({ code: 'no-assertion' });
  }
  if (exportable > 0 && !hasTestStart) {
    warnings.push({ code: 'no-test-start' });
  }

  if (start) {
    const otherHosts = new Set<string>();
    for (const http of exportedHttpRecords(record)) {
      const url = relativize(http.key, start);
      if (url && /^https?:\/\//.test(url)) {
        otherHosts.add(new URL(url).host);
      }
    }
    if (otherHosts.size > 0) {
      warnings.push({ code: 'other-domain', count: otherHosts.size, detail: [...otherHosts].join(', ') });
    }
  }

  return { blocking, warnings };
}

/** Nom de fichier à partir du nom du test : minuscules, sans accents ni espaces */
export function slugify(name: string): string {
  const slug = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'scenario';
}

function contentType(http: HttpReturn): string | undefined {
  const headers = http.headers ?? {};
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'content-type');
  return key ? headers[key] : undefined;
}

function buildMocks(record: Record, start: URL): MockEntry[] {
  const mocks: MockEntry[] = [];
  for (const http of exportedHttpRecords(record)) {
    const url = relativize(http.key, start);
    if (!url) {
      continue;
    }
    const status = Number(http.httpCode) || 0;
    mocks.push({
      method: (http.method || 'GET').toUpperCase(),
      url,
      status,
      contentType: contentType(http),
      body: http.response ?? null
    });
  }
  return mocks;
}

function commentLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => `  // ${line}`);
}

/** Lignes du test pour une action, vide si l'action n'a pas d'équivalent */
function actionLines(action: Action, start: URL, isStart: boolean, context: SpecContext): string[] {
  const userAction = action.userAction;
  if (isInIframe(userAction)) {
    return [];
  }
  switch (action.actionType) {
    case ActionType.NAVIGATE: {
      if (isStart) {
        return [];
      }
      if (userAction?.type === 'reload') {
        return ['  await page.reload();'];
      }
      const url = userAction?.hrefLocation ? relativize(userAction.hrefLocation, start) : null;
      return url ? [`  await page.goto(${q(url)});`] : [];
    }
    case ActionType.EVENT:
      return eventLines(userAction);
    case ActionType.RECORD_BY_LABEL:
      // Même règle que le rejeu Tuello : le premier élément affichant ce libellé
      return userAction?.label ? [`  await page.getByText(${q(userAction.label)}, { exact: true }).first().click();`] : [];
    case ActionType.COMMENT:
      return typeof action.data === 'string' && action.data.trim() ? commentLines(action.data) : [];
    case ActionType.SCREENSHOT:
      return context.screenshot();
    case ActionType.ASSERTION:
      return assertionLines(userAction);
    case ActionType.RECORD_BY_IMAGE:
      return ['  // À compléter : clic sur une image, sans équivalent Playwright direct'];
    default:
      return [];
  }
}

/** Sélecteur CSS construit sur un identifiant ou un attribut, et non sur la position dans la page */
function isStableSelector(selector: string | undefined): boolean {
  return !!selector && !selector.includes(':nth-of-type') && /[#[]/.test(selector);
}

function assertionLines(userAction: IUserAction | null | undefined): string[] {
  const target = userAction?.target;
  if (userAction?.type === 'assertVisible') {
    const locator = locatorFor(target, userAction.selector);
    return locator ? [`  await expect(${locator}).toBeVisible();`] : ['  // À compléter : vérification de visibilité sur un élément non identifié'];
  }
  const value = userAction?.value ?? '';
  if (target && FIELD_TAGS.includes(target.tag)) {
    const locator = locatorFor(target, userAction.selector);
    if (locator) {
      return target.inputType === 'password' ? [`  await expect(${locator}).not.toBeEmpty();`] : [`  await expect(${locator}).toHaveValue(${q(value)});`];
    }
  }
  // Texte d'un élément identifié de façon stable : on vérifie CET élément (un message de
  // confirmation à un emplacement précis), sinon que le texte est affiché quelque part.
  if (target?.testId) {
    return [`  await expect(page.getByTestId(${q(target.testId)})).toContainText(${q(value)});`];
  }
  const selector = target?.selector || userAction?.selector;
  if (isStableSelector(selector)) {
    return [`  await expect(page.locator(${q(selector)})).toContainText(${q(value)});`];
  }
  return [`  await expect(page.getByText(${q(value)}).first()).toBeVisible();`];
}

function eventLines(userAction: IUserAction | null | undefined): string[] {
  if (!userAction || IGNORED_EVENTS.includes(userAction.type)) {
    return [];
  }
  switch (userAction.type) {
    case 'click': {
      const locator = locatorFor(userAction.target);
      if (locator) {
        return [`  await ${locator}.click();`];
      }
      return [`  // À vérifier : élément sans libellé, clic rejoué par coordonnées`, `  await page.mouse.click(${Math.round(userAction.x ?? 0)}, ${Math.round(userAction.y ?? 0)});`];
    }
    case 'input': {
      // Le clic qui a coché la case ou choisi le fichier est déjà exporté
      if (NON_TEXT_INPUTS.includes(userAction.target?.inputType)) {
        return [];
      }
      const locator = locatorFor(userAction.target, userAction.selector);
      if (locator && userAction.target?.tag === 'select') {
        return [`  await ${locator}.selectOption(${q(userAction.value ?? '')});`];
      }
      const value = userAction.target?.inputType === 'password' ? "process.env.E2E_PASSWORD ?? ''" : q(userAction.value ?? '');
      if (locator) {
        return [`  await ${locator}.fill(${value});`];
      }
      return [`  // À vérifier : champ introuvable, saisie de ${q(userAction.value ?? '')} non exportée`];
    }
    case 'enterKey': {
      const locator = locatorFor(userAction.target, userAction.selector);
      return [locator ? `  await ${locator}.press('Enter');` : "  await page.keyboard.press('Enter');"];
    }
    default:
      return [`  // Action « ${userAction.type} » non exportée`];
  }
}

/**
 * Clic dans un champ juste avant de le remplir : il ne fait que donner le focus, ce que
 * `fill()` et `selectOption()` font déjà. L'exporter alourdirait le test pour rien.
 */
function isFocusClick(action: Action, following: Action[]): boolean {
  const userAction = action.userAction;
  if (action.actionType !== ActionType.EVENT || userAction?.type !== 'click' || !userAction.target?.selector) {
    return false;
  }
  // Sur une case à cocher, c'est le clic qui agit : l'évènement `input` qui suit n'est pas exporté
  if (NON_TEXT_INPUTS.includes(userAction.target.inputType)) {
    return false;
  }
  const next = following.find((candidate) => !(candidate?.actionType === ActionType.EVENT && IGNORED_EVENTS.includes(candidate.userAction?.type)));
  return next?.actionType === ActionType.EVENT && next.userAction?.type === 'input' && next.userAction.selector === userAction.target.selector;
}

/** Génération d'un test : compteur des captures d'écran, pour nommer les références */
interface SpecContext {
  screenshot: () => string[];
}

function buildSpec(record: Record, start: URL, options: ExportOptions, files: { mocks: string; state: string | null }, now: Date): string {
  const slug = slugify(options.testName);
  const startPath = start.pathname + start.search + start.hash;
  const actions = record.actions ?? [];
  const startIndex = actions.findIndex((action) => !!action?.userAction?.hrefLocation);
  const markerIndex = actions.findIndex((action) => action?.actionType === ActionType.TEST_START);

  let screenshots = 0;
  const context: SpecContext = {
    screenshot: () => [`  await expect(page).toHaveScreenshot(${q(`${slug}-${++screenshots}.png`)});`]
  };

  const setup: string[] = [];
  const body: string[] = [];
  actions.forEach((action, index) => {
    if (!action || isFocusClick(action, actions.slice(index + 1))) {
      return;
    }
    const lines = actionLines(action, start, index === startIndex && action.actionType === ActionType.NAVIGATE, context);
    (index < markerIndex ? setup : body).push(...lines);
  });

  const usesExpect = [...setup, ...body].some((line) => line.includes('expect('));
  const helpers = ['chargerBouchons', ...(files.state ? ['chargerEtat'] : []), 'installerBouchons', ...(files.state ? ['restaurerEtat'] : [])];
  const fixtures = files.state ? '{ page, baseURL }' : '{ page }';

  return [
    `import { ${usesExpect ? 'expect, ' : ''}test } from '@playwright/test';`,
    `import { ${helpers.join(', ')} } from '../support/tuello';`,
    '',
    `// Généré par Tuello le ${now.toLocaleDateString('fr-FR')} depuis ${start.href}`,
    '',
    '// Mise en place : contexte du navigateur, réponses HTTP enregistrées, page de départ',
    `test.beforeEach(async (${fixtures}) => {`,
    ...(files.state ? [`  await restaurerEtat(page, baseURL, chargerEtat(${q(files.state)}));`] : []),
    `  await installerBouchons(page, chargerBouchons(${q(files.mocks)}));`,
    `  await page.goto(${q(startPath)});`,
    ...setup,
    '});',
    '',
    `test(${q(options.testName)}, async ({ page }) => {`,
    ...body,
    '});',
    ''
  ].join('\n');
}

/** Fichiers à produire, chemins relatifs au dossier e2e/ */
export function generatePlaywrightFiles(record: Record, options: ExportOptions, now = new Date()): ZipEntry[] {
  const start = findStartUrl(record);
  if (!start) {
    return [];
  }
  const slug = slugify(options.testName);
  const mocksFile = `${slug}.mocks.json`;
  const state = buildStateFile(options.stateEntries ?? [], now);
  const stateFile = state ? `${slug}.etat.json` : null;

  const files: ZipEntry[] = [
    { path: `e2e/tests/${slug}.spec.ts`, content: buildSpec(record, start, options, { mocks: mocksFile, state: stateFile }, now) },
    { path: `e2e/fixtures/${mocksFile}`, content: JSON.stringify(buildMocks(record, start), null, 2) + '\n' },
    // Fichier géré par Tuello, remplacé à chaque export : un test exporté par une version
    // plus récente peut s'appuyer sur une fonction qu'il n'avait pas.
    { path: 'e2e/support/tuello.ts', content: SUPPORT_TUELLO }
  ];
  if (state) {
    files.push({ path: `e2e/fixtures/${stateFile}`, content: JSON.stringify(state, null, 2) + '\n' });
  }

  if (options.mode === 'full') {
    files.push(
      { path: 'e2e/package.json', content: packageJson() },
      { path: 'e2e/playwright.config.ts', content: playwrightConfig(start.origin) },
      { path: 'e2e/README.md', content: README },
      { path: 'e2e/gitlab-ci.exemple.yml', content: gitlabCi() },
      { path: 'e2e/.gitignore', content: 'node_modules/\nplaywright-report/\ntest-results/\nresults.xml\n' }
    );
  }
  return files;
}
