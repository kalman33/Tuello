import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { formatDate } from '../../core/utils/date-utils';
import { HttpReturn } from '../../recorder-http/models/http.return';
import { Action } from '../../spy-http/models/Action';
import { ActionType } from '../../spy-http/models/ActionType';
import { ComparisonResult } from '../../spy-http/models/ComparisonResult';
import { ConsoleLogEntry } from '../../spy-http/models/ConsoleLogEntry';
import { Record } from '../../spy-http/models/Record';

/** Informations facultatives saisies avant la génération (voir `ReportMetadataDialogComponent`),
 * affichées en tête du rapport, avant les actions enregistrées. */
export interface ReportMetadata {
  user?: string;
  comment?: string;
}

/** Donnée à mettre en évidence, saisie sur la page Rapport avant génération (voir
 * `ReportComponent`) : la valeur correspondante est recherchée dans chaque requête HTTP et figée
 * dans le rapport HTML généré (pas de recherche interactive dans le fichier exporté). */
export interface ReportHighlight {
  source: 'response' | 'header' | 'requestHeader';
  key: string;
}

/** Forme attendue par le module "Enregistrer & rejouer HTTP" pour importer des bouchons (voir
 * `TuelloRecord` dans `chrome/src/httpmanager.ts` et `RecorderHttpComponent.applyImportedData`) :
 * un simple tableau de `{key, method?, response, httpCode, headers?, delay?}`. */
interface TuelloMockRecord {
  key: string;
  method?: string;
  response: unknown;
  httpCode: number;
  headers?: { [k: string]: string };
  delay?: number;
}

@Injectable({ providedIn: 'root' })
export class HtmlReportService {
  constructor(private translate: TranslateService) {}

  async generateReport(record: Record, comparisonResults?: ComparisonResult[], metadata?: ReportMetadata, highlight?: ReportHighlight): Promise<void> {
    // record.httpRecords est alimenté via unshift (ordre antichronologique) : on calcule l'ordre
    // chronologique une seule fois, partagé entre la section Actions (entrelacement) et la
    // section HTTP (ancres), pour que les index d'ancre correspondent exactement.
    const chronologicalHttp = (record.httpRecords || []).slice().reverse();

    // Recherche faite une seule fois ici (pas dans le rapport exporté, voir ReportComponent) :
    // même index que `chronologicalHttp`, pour partager le résultat entre les sections Actions et HTTP.
    const highlightValues = chronologicalHttp.map((http) => this.computeHighlightValue(http, highlight));

    // Même base que le nom du fichier HTML (voir plus bas) : les bouchons exportés depuis le
    // rapport doivent être facilement associables au rapport dont ils proviennent.
    const baseFileName = `tuello-report-${formatDate(new Date())}`;

    const sections: string[] = [this.buildHeader(record, comparisonResults)];

    const metadataSection = this.buildMetadataSection(metadata);
    if (metadataSection) {
      sections.push(metadataSection);
    }

    if (record.actions?.length) {
      sections.push(await this.buildActionsSection(record.actions, chronologicalHttp, highlightValues));
    }
    if (chronologicalHttp.length) {
      sections.push(await this.buildHttpSection(chronologicalHttp, baseFileName, highlightValues));
    }
    if (record.consoleLogs?.length) {
      sections.push(this.buildConsoleSection(record.consoleLogs));
    }
    if (comparisonResults?.length) {
      sections.push(await this.buildComparisonSection(comparisonResults));
    }

    const html = this.buildDocument(sections.join('\n'));
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `${baseFileName}.html`);
  }

  private buildDocument(bodyContent: string): string {
    const title = this.escapeHtml(this.translate.instant('mmn.report.export.title'));
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${this.buildStyles()}</style>
</head>
<body>
<div class="bg-blobs" aria-hidden="true"><div class="blob blob-1"></div><div class="blob blob-2"></div><div class="blob blob-3"></div></div>
<div class="report-container">
${bodyContent}
</div>
</body>
</html>`;
  }

  private buildHeader(record: Record, comparisonResults?: ComparisonResult[]): string {
    const httpErrors = (record.httpRecords || []).filter((http) => Number(http.httpCode) >= 400).length;
    const consoleErrors = (record.consoleLogs || []).filter((entry) => entry.level === 'error').length;

    const stats: Array<{ label: string; value: number; danger?: boolean }> = [
      { label: this.translate.instant('mmn.report.summary.actions'), value: record.actions?.length ?? 0 },
      { label: this.translate.instant('mmn.report.summary.httpRequests'), value: record.httpRecords?.length ?? 0 },
      { label: this.translate.instant('mmn.report.summary.httpErrors'), value: httpErrors, danger: httpErrors > 0 },
      { label: this.translate.instant('mmn.report.summary.consoleLogs'), value: record.consoleLogs?.length ?? 0 },
      { label: this.translate.instant('mmn.report.summary.consoleErrors'), value: consoleErrors, danger: consoleErrors > 0 },
      { label: this.translate.instant('mmn.report.summary.comparisonResults'), value: comparisonResults?.length ?? 0 }
    ];
    const statCards = stats.map((stat) => `<div class="stat-card${stat.danger ? ' stat-card-danger' : ''}"><span class="stat-value">${stat.value}</span><span class="stat-label">${this.escapeHtml(stat.label)}</span></div>`).join('');

    return `<header class="report-header">
  <h1>${this.escapeHtml(this.translate.instant('mmn.report.export.title'))}</h1>
  <p class="generated-on">${this.escapeHtml(this.translate.instant('mmn.report.export.generatedOn'))} ${this.escapeHtml(new Date().toLocaleString())}</p>
  <div class="stat-grid">${statCards}</div>
</header>`;
  }

  /** Vide si ni l'utilisateur ni le commentaire n'ont été renseignés (les deux sont facultatifs
   * dans `ReportMetadataDialogComponent`) : pas de section vide dans le rapport. */
  private buildMetadataSection(metadata?: ReportMetadata): string {
    const user = metadata?.user?.trim();
    const comment = metadata?.comment?.trim();
    if (!user && !comment) {
      return '';
    }

    const parts: string[] = [];
    if (user) {
      parts.push(`<p><strong>${this.escapeHtml(this.translate.instant('mmn.report.metadata.user'))} :</strong> ${this.escapeHtml(user)}</p>`);
    }
    if (comment) {
      // `white-space: pre-wrap` (voir buildStyles) préserve les retours à la ligne du commentaire
      // sans avoir à les convertir en <br> après l'échappement HTML.
      parts.push(`<p><strong>${this.escapeHtml(this.translate.instant('mmn.report.metadata.comment'))} :</strong></p><p class="metadata-comment">${this.escapeHtml(comment)}</p>`);
    }

    return `<section class="section--metadata">
  <h2><span class="section-icon section-icon--metadata">i</span> ${this.escapeHtml(this.translate.instant('mmn.report.section.metadata.title'))}</h2>
  ${parts.join('\n')}
</section>`;
  }

  /**
   * Entrelace les actions et les requêtes HTTP par ordre chronologique réel (timestamp), pas
   * seulement par position dans leurs tableaux respectifs. Chaque requête HTTP est un lien
   * cliquable vers son ancre dans la section "Requêtes HTTP" (même index que `buildHttpSection`,
   * les deux méthodes reçoivent le même tableau `chronologicalHttp`).
   */
  private async buildActionsSection(actions: Action[], chronologicalHttp: HttpReturn[], highlightValues: Array<string | undefined>): Promise<string> {
    const timeline: Array<{ timestamp: number; html: string }> = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const imageData = this.extractImageDataUrl(action);
      let body: string;

      if (imageData) {
        // Capture "avant" (clic) : repère dessiné si on connaît la position du clic.
        const optimized = action.screenshotMarker ? await this.drawScreenshotWithMarker(imageData, action.screenshotMarker, 600) : await this.optimizeImageForReport(imageData, 600);
        body = `<img class="action-image" src="${optimized}" alt="" />`;
      } else {
        const text = this.actionSummaryText(action);
        body = text ? `<p class="action-text">${this.escapeHtml(text)}</p>` : '';
      }

      const html = `<div class="action-entry">
  <div class="action-header"><span class="action-index">${i + 1}</span> <span class="action-type">${this.escapeHtml(this.actionTypeLabel(action))}</span> <span class="action-delay">${action.delay} ms</span></div>
  ${body}
</div>`;
      timeline.push({ timestamp: action.timestamp ?? 0, html });
    }

    for (let index = 0; index < chronologicalHttp.length; index++) {
      const http = chronologicalHttp[index];
      const code = Number(http.httpCode);
      const isError = !Number.isNaN(code) && code >= 400;

      // Capture "après" (fin d'appel HTTP, DOM stabilisé) : pas de repère, la page a déjà changé.
      const screenshotHtml = http.screenshot ? `<img class="action-image" src="${await this.optimizeImageForReport(http.screenshot, 600)}" alt="" />` : '';
      const highlightValue = highlightValues[index];
      const highlightHtml = highlightValue ? `<span class="action-http-highlight">${this.escapeHtml(highlightValue)}</span>` : '';

      const html = `<a class="action-http-link${isError ? ' http-error' : ''}" href="#http-entry-${index}">
  <span class="action-http-badge">HTTP</span>
  <span class="badge ${this.httpMethodBadgeClass(http.method)}">${this.escapeHtml(http.method || '?')}</span>
  <span class="badge ${this.httpCodeBadgeClass(code)}">${this.escapeHtml(String(http.httpCode ?? '?'))}</span>
  <span class="http-url">${this.escapeHtml(http.key)}</span>
  ${highlightHtml}
</a>
${screenshotHtml}`;
      timeline.push({ timestamp: http.timestamp ?? 0, html });
    }

    // Tri stable (ES2019+) : à timestamp égal, l'ordre d'insertion ci-dessus est conservé.
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return `<details class="report-section report-section--actions" open>
  <summary><span class="report-section-title"><span class="report-section-arrow">▸</span><span class="section-icon section-icon--actions">A</span> ${this.escapeHtml(this.translate.instant('mmn.report.section.actions.title'))}</span></summary>
  <div class="report-section-body">
  ${timeline.map((item) => item.html).join('\n')}
  </div>
</details>`;
  }

  private async buildHttpSection(chronologicalHttp: HttpReturn[], baseFileName: string, highlightValues: Array<string | undefined>): Promise<string> {
    const rows: string[] = [];
    const mocks: TuelloMockRecord[] = [];

    for (let index = 0; index < chronologicalHttp.length; index++) {
      const http = chronologicalHttp[index];
      const code = Number(http.httpCode);
      const isError = !Number.isNaN(code) && code >= 400;
      const isSlow = typeof http.duration === 'number' && http.duration > 1000;
      const duration = typeof http.duration === 'number' ? `${http.duration} ms` : '—';

      const summary = `<span class="badge ${this.httpMethodBadgeClass(http.method)}">${this.escapeHtml(http.method || '?')}</span> <span class="badge ${this.httpCodeBadgeClass(code)}">${this.escapeHtml(String(http.httpCode ?? '?'))}</span> <span class="http-duration${isSlow ? ' http-slow' : ''}">${this.escapeHtml(duration)}</span> <span class="http-url">${this.escapeHtml(http.key)}</span>`;

      const requestHeadersSection = this.renderJsonSection(this.translate.instant('mmn.report.http.requestHeaders'), http.requestHeaders);
      const bodySection = this.renderJsonSection(this.translate.instant('mmn.report.http.requestBody'), http.body);
      const highlightValue = highlightValues[index];
      const highlightSlot = highlightValue ? `<div class="http-highlight">${this.escapeHtml(highlightValue)}</div>` : '';
      // Classe dédiée sur ces deux sous-sections (et seulement celles-ci) : c'est ce que cible la
      // recherche interactive injectée par `buildHttpSearchScript`, qui ne doit porter que sur
      // les réponses/headers, pas sur le corps de requête envoyé.
      const responseSection = this.renderJsonSection(this.translate.instant('mmn.report.http.response'), http.response, 'http-subsection--response');
      const headersSection = this.renderJsonSection(this.translate.instant('mmn.report.http.headers'), http.headers, 'http-subsection--headers');

      // Même forme que ce que "Enregistrer & rejouer HTTP" importe/exporte déjà (voir
      // ExportComponent.save) : quelqu'un qui reproduit le scénario peut réimporter ces bouchons
      // pour obtenir les mêmes réponses, sans avoir à les reconstituer à la main.
      mocks.push({
        key: http.key,
        method: http.method,
        response: http.response,
        httpCode: code,
        headers: http.headers,
        delay: typeof http.duration === 'number' ? http.duration : undefined
      });

      rows.push(
        `<details class="http-entry" id="http-entry-${index}">
  <summary>
    <span class="http-summary-text">${summary}</span>
    <button type="button" class="tuello-export-btn" onclick="tuelloExportMock(event, ${index})">${this.escapeHtml(this.translate.instant('mmn.report.http.exportMock'))}</button>
  </summary>
  ${requestHeadersSection}${bodySection}${highlightSlot}${responseSection}${headersSection}
</details>`
      );
    }

    return `<details class="report-section report-section--http" open>
  <summary>
    <span class="report-section-title"><span class="report-section-arrow">▸</span><span class="section-icon section-icon--http">H</span> ${this.escapeHtml(this.translate.instant('mmn.report.section.http.title'))}</span>
    <button type="button" class="tuello-export-btn tuello-export-all-btn" onclick="event.preventDefault(); event.stopPropagation(); tuelloExportAllMocks()">${this.escapeHtml(this.translate.instant('mmn.report.http.exportAllMocks'))}</button>
  </summary>
  <div class="report-section-body">
  ${this.buildHttpSearchBar()}
  ${rows.join('\n')}
  </div>
</details>
${this.buildMockExportScript(mocks, baseFileName)}`;
  }

  /** Barre de recherche live (voir `buildHttpSearchScript`) : contrairement à la mise en évidence
   * (`ReportHighlight`, figée à la génération sur une seule clé), elle fonctionne après coup, dans
   * le rapport déjà exporté, sur un texte libre recherché dans les réponses et les headers de
   * toutes les requêtes. `onclick` avec `stopPropagation` évite qu'un clic dans la barre
   * replie/déplie le `<details>` parent (comportement par défaut d'un clic dans un `<summary>`). */
  private buildHttpSearchBar(): string {
    const placeholder = this.escapeHtml(this.translate.instant('mmn.report.http.search.placeholder'));
    const prevLabel = this.escapeHtml(this.translate.instant('mmn.report.http.search.prev'));
    const nextLabel = this.escapeHtml(this.translate.instant('mmn.report.http.search.next'));
    return `<div class="tuello-http-search" onclick="event.stopPropagation()">
    <input type="search" id="tuelloHttpSearchInput" class="tuello-http-search-input" placeholder="${placeholder}" oninput="tuelloHttpSearch(this.value)" onkeydown="tuelloHttpSearchKeydown(event)" />
    <span id="tuelloHttpSearchCount" class="tuello-http-search-count" aria-live="polite"></span>
    <button type="button" class="tuello-http-search-nav" aria-label="${prevLabel}" title="${prevLabel}" onclick="tuelloHttpSearchNav(-1)">▲</button>
    <button type="button" class="tuello-http-search-nav" aria-label="${nextLabel}" title="${nextLabel}" onclick="tuelloHttpSearchNav(1)">▼</button>
  </div>`;
  }

  /** Calcule, une seule fois à la génération, la valeur à mettre en évidence pour une requête
   * HTTP donnée (voir `ReportHighlight`) : pas de recherche interactive dans le rapport exporté. */
  private computeHighlightValue(http: HttpReturn, highlight?: ReportHighlight): string | undefined {
    const key = highlight?.key?.trim();
    if (!key) {
      return undefined;
    }

    let value: unknown;
    if (highlight!.source === 'header') {
      value = this.findHeaderValue(http.headers, key);
    } else if (highlight!.source === 'requestHeader') {
      value = this.findHeaderValue(http.requestHeaders, key);
    } else {
      let response: unknown = http.response;
      if (typeof response === 'string') {
        try {
          response = JSON.parse(response);
        } catch {
          response = undefined;
        }
      }
      value = this.findValueRecursive(response, key);
    }

    if (value === undefined) {
      return undefined;
    }
    const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${key} : ${display}`;
  }

  /** Recherche récursive d'une clé (insensible à la casse) dans un objet/tableau JSON arbitraire :
   * la donnée à mettre en évidence peut se trouver à n'importe quel niveau de la réponse. */
  private findValueRecursive(value: unknown, key: string): unknown {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findValueRecursive(item, key);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    }
    const obj = value as { [k: string]: unknown };
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === key.toLowerCase()) {
        return obj[k];
      }
    }
    for (const k of Object.keys(obj)) {
      const found = this.findValueRecursive(obj[k], key);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  private findHeaderValue(headers: { [k: string]: string } | undefined, key: string): string | undefined {
    if (!headers) {
      return undefined;
    }
    const foundKey = Object.keys(headers).find((k) => k.toLowerCase() === key.toLowerCase());
    return foundKey !== undefined ? headers[foundKey] : undefined;
  }

  /**
   * Le rapport est une page HTML autonome (pas d'Angular, pas de dépendance externe) : les
   * bouchons sont donc embarqués tels quels dans un `<script>` inline, et le téléchargement se
   * fait en JS natif (Blob + lien temporaire). Tous les "<" sont échappés dans le JSON embarqué :
   * une réponse HTTP arbitraire pourrait contenir la séquence "</script>" et clore la balise
   * prématurément, cassant le reste de la page. Les fichiers téléchargés reprennent le nom du
   * rapport HTML (`baseFileName`) pour rester facilement associables entre eux.
   */
  private buildMockExportScript(mocks: TuelloMockRecord[], baseFileName: string): string {
    const json = JSON.stringify(mocks).replace(/</g, '\\u003c');
    const safeBaseFileName = JSON.stringify(baseFileName);
    return `<script>
const TUELLO_MOCKS = ${json};
const TUELLO_BASE_FILE_NAME = ${safeBaseFileName};
function tuelloDownloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function tuelloExportAllMocks() {
  tuelloDownloadJson(TUELLO_MOCKS, TUELLO_BASE_FILE_NAME + '.json');
}
function tuelloExportMock(event, index) {
  // Empêche le clic d'ouvrir/fermer le <details> parent (comportement par défaut d'un clic
  // dans un <summary>).
  event.preventDefault();
  event.stopPropagation();
  tuelloDownloadJson([TUELLO_MOCKS[index]], TUELLO_BASE_FILE_NAME + '-mock-' + (index + 1) + '.json');
}
${this.buildHttpSearchScript()}
</script>`;
  }

  /**
   * Recherche interactive dans le rapport déjà exporté (JS natif, pas de dépendance externe) :
   * contrairement à `ReportHighlight`, qui fige UNE valeur à la génération, cette recherche
   * fonctionne sur un texte libre, après coup, sur TOUTES les requêtes HTTP affichées. Elle ne
   * porte que sur `.http-subsection--response`/`.http-subsection--headers` (voir `renderJsonSection`),
   * jamais sur le corps de requête envoyé.
   *
   * Chaque correspondance découpe le texte du nœud concerné et l'entoure d'un `<mark>` (le DOM
   * est donc réécrit à chaque recherche : `tuelloHttpSearchClearMarks` défait ce découpage avant
   * toute nouvelle recherche, via `Node.normalize()`, pour repartir d'un texte intact).
   */
  private buildHttpSearchScript(): string {
    return `let tuelloSearchMatches = [];
let tuelloSearchIndex = -1;
let tuelloSearchDebounce = null;

function tuelloHttpSearchClearMarks() {
  document.querySelectorAll('mark.tuello-search-mark').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  document.querySelectorAll('.http-entry.tuello-dimmed').forEach((entry) => entry.classList.remove('tuello-dimmed'));
  tuelloSearchMatches = [];
  tuelloSearchIndex = -1;
}

function tuelloHttpSearchUpdateCount() {
  const countEl = document.getElementById('tuelloHttpSearchCount');
  const inputEl = document.getElementById('tuelloHttpSearchInput');
  if (!countEl) return;
  if (!tuelloSearchMatches.length) {
    countEl.textContent = inputEl && inputEl.value.trim() ? '0' : '';
    return;
  }
  countEl.textContent = (tuelloSearchIndex + 1) + ' / ' + tuelloSearchMatches.length;
}

function tuelloHttpSearchGoTo(index) {
  if (!tuelloSearchMatches.length) return;
  const previous = tuelloSearchMatches[tuelloSearchIndex];
  if (previous) previous.classList.remove('tuello-search-mark--active');
  tuelloSearchIndex = ((index % tuelloSearchMatches.length) + tuelloSearchMatches.length) % tuelloSearchMatches.length;
  const current = tuelloSearchMatches[tuelloSearchIndex];
  current.classList.add('tuello-search-mark--active');
  current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tuelloHttpSearchUpdateCount();
}

function tuelloHttpSearchRun(term) {
  tuelloHttpSearchClearMarks();
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    tuelloHttpSearchUpdateCount();
    return;
  }

  document.querySelectorAll('.http-entry').forEach((entry) => {
    const sections = entry.querySelectorAll('.http-subsection--response, .http-subsection--headers');
    let entryHasMatch = false;

    sections.forEach((section) => {
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }

      textNodes.forEach((textNode) => {
        const text = textNode.textContent;
        const lower = text.toLowerCase();
        let matchIndex = lower.indexOf(normalized);
        if (matchIndex === -1 || !textNode.parentNode) return;

        entryHasMatch = true;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        while (matchIndex !== -1) {
          frag.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
          const mark = document.createElement('mark');
          mark.className = 'tuello-search-mark';
          mark.textContent = text.slice(matchIndex, matchIndex + normalized.length);
          frag.appendChild(mark);
          tuelloSearchMatches.push(mark);
          cursor = matchIndex + normalized.length;
          matchIndex = lower.indexOf(normalized, cursor);
        }
        frag.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(frag, textNode);
      });
    });

    entry.classList.toggle('tuello-dimmed', !entryHasMatch);

    if (entryHasMatch) {
      // Déplie l'entrée et chaque <details> ancêtre d'une correspondance (sous-section, nœuds de
      // l'arbre JSON) : une correspondance repliée resterait invisible malgré le surlignage.
      entry.open = true;
      entry.querySelectorAll('mark.tuello-search-mark').forEach((mark) => {
        let ancestor = mark.parentElement;
        while (ancestor && ancestor !== entry) {
          if (ancestor.tagName === 'DETAILS') ancestor.open = true;
          ancestor = ancestor.parentElement;
        }
      });
    }
  });

  if (tuelloSearchMatches.length) {
    tuelloSearchIndex = 0;
    tuelloSearchMatches[0].classList.add('tuello-search-mark--active');
    tuelloSearchMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  tuelloHttpSearchUpdateCount();
}

function tuelloHttpSearch(value) {
  clearTimeout(tuelloSearchDebounce);
  tuelloSearchDebounce = setTimeout(() => tuelloHttpSearchRun(value), 120);
}

function tuelloHttpSearchNav(direction) {
  tuelloHttpSearchGoTo(tuelloSearchIndex + direction);
}

function tuelloHttpSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    tuelloHttpSearchNav(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.target.value = '';
    tuelloHttpSearchClearMarks();
    tuelloHttpSearchUpdateCount();
  }
}`;
  }

  private buildConsoleSection(entries: ConsoleLogEntry[]): string {
    const rows = entries
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `<div class="console-entry console-${entry.level}"><span class="console-level">[${entry.level.toUpperCase()}]</span> <span class="console-time">${this.escapeHtml(time)}</span> <span class="console-message">${this.escapeHtml(entry.message)}</span></div>`;
      })
      .join('\n');

    return `<details class="report-section report-section--console" open>
  <summary><span class="report-section-title"><span class="report-section-arrow">▸</span><span class="section-icon section-icon--console">C</span> ${this.escapeHtml(this.translate.instant('mmn.report.section.console.title'))}</span></summary>
  <div class="report-section-body">
  ${rows}
  </div>
</details>`;
  }

  private async buildComparisonSection(comparisonResults: ComparisonResult[]): Promise<string> {
    const parts: string[] = [];

    for (const result of comparisonResults) {
      const candidates: Array<{ label: string; src?: string }> = [
        { label: this.translate.instant('mmn.report.comparison.reference'), src: result.comparisonImage },
        { label: this.translate.instant('mmn.report.comparison.actual'), src: result.actualImage },
        { label: this.translate.instant('mmn.report.comparison.diff'), src: result.compareResult?.imageDataUrl }
      ];

      const figures: string[] = [];
      for (const candidate of candidates) {
        if (!candidate.src) continue;
        const optimized = await this.optimizeImageForReport(candidate.src, 400);
        figures.push(`<figure><figcaption>${this.escapeHtml(candidate.label)}</figcaption><img src="${optimized}" alt="" /></figure>`);
      }

      parts.push(
        `<div class="comparison-entry">
  <div class="comparison-header">${this.escapeHtml(this.translate.instant('mmn.report.comparison.action'))} ${this.escapeHtml(result.actionId?.slice(0, 8) ?? '')} — ${result.compareResult?.misMatchPercentage ?? 0} %</div>
  <div class="comparison-images">${figures.join('')}</div>
</div>`
      );
    }

    return `<section class="section--comparison">
  <h2><span class="section-icon section-icon--comparison">V</span> ${this.escapeHtml(this.translate.instant('mmn.report.section.comparison.title'))}</h2>
  ${parts.join('\n')}
</section>`;
  }

  /** Affiche `raw` (déjà parsé, ou chaîne JSON à parser, ou texte brut en repli) comme sous-section repliable.
   * `extraClass` (ex: `http-subsection--response`) permet de cibler cette sous-section précisément
   * depuis le script de recherche interactive (voir `buildHttpSearchScript`). */
  private renderJsonSection(label: string, raw: unknown, extraClass?: string): string {
    if (raw === undefined || raw === null || raw === '') {
      return '';
    }
    const cssClass = extraClass ? `http-subsection ${extraClass}` : 'http-subsection';

    let value: unknown = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        return `<div class="${cssClass}">
  <div class="http-subsection-title">${this.escapeHtml(label)}</div>
  <pre class="tree-plaintext">${this.escapeHtml(raw)}</pre>
</div>`;
      }
    }

    return `<div class="${cssClass}">
  <div class="http-subsection-title">${this.escapeHtml(label)}</div>
  ${this.renderJsonTree(value)}
</div>`;
  }

  /** Arbre JSON natif via <details>/<summary> : aucun JS requis pour plier/déplier. */
  private renderJsonTree(value: unknown): string {
    if (value === null || value === undefined) {
      return '<span class="tree-null">null</span>';
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return '<span class="tree-meta">[ ]</span>';
      }
      const rows = value.map((item, index) => `<div class="tree-row"><span class="tree-key">${index}:</span> ${this.renderJsonTree(item)}</div>`).join('');
      return `<details><summary class="tree-summary">[ ${value.length} élément(s) ]</summary><div class="tree-children">${rows}</div></details>`;
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as object);
      if (!keys.length) {
        return '<span class="tree-meta">{ }</span>';
      }
      const rows = keys.map((key) => `<div class="tree-row"><span class="tree-key">${this.escapeHtml(key)}:</span> ${this.renderJsonTree((value as { [k: string]: unknown })[key])}</div>`).join('');
      return `<details><summary class="tree-summary">{ ${keys.length} clé(s) }</summary><div class="tree-children">${rows}</div></details>`;
    }

    if (typeof value === 'string') {
      return `<span class="tree-string">"${this.escapeHtml(value)}"</span>`;
    }

    if (typeof value === 'number') {
      return `<span class="tree-number">${value}</span>`;
    }

    if (typeof value === 'boolean') {
      return `<span class="tree-boolean">${value}</span>`;
    }

    return `<span class="tree-meta">${this.escapeHtml(String(value))}</span>`;
  }

  /** Classe de couleur du badge méthode HTTP (voir buildStyles) : une couleur par verbe pour
   * repérer le type d'appel au premier coup d'œil dans la timeline/section HTTP. */
  private httpMethodBadgeClass(method?: string): string {
    switch ((method || '').toUpperCase()) {
      case 'GET':
        return 'badge-method-get';
      case 'POST':
        return 'badge-method-post';
      case 'PUT':
      case 'PATCH':
        return 'badge-method-put';
      case 'DELETE':
        return 'badge-method-delete';
      default:
        return 'badge-method-other';
    }
  }

  /** Classe de couleur du badge code HTTP (2xx vert, 4xx/5xx rouge...), voir buildStyles. */
  private httpCodeBadgeClass(code: number): string {
    if (Number.isNaN(code)) return 'badge-code-other';
    if (code >= 500) return 'badge-code-5xx';
    if (code >= 400) return 'badge-code-4xx';
    if (code >= 300) return 'badge-code-3xx';
    if (code >= 200) return 'badge-code-2xx';
    return 'badge-code-other';
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * `chrome.tabs.captureVisibleTab` capture à la résolution native de l'écran (souvent 2x/3x
   * sur un écran retina) : sans redimensionnement, une session avec plusieurs captures produit
   * un fichier énorme. On redimensionne à une largeur d'affichage raisonnable puis on
   * recompresse en JPEG, nettement plus compact qu'un PNG pour ce type de contenu.
   */
  private optimizeImageForReport(dataUrl: string, maxWidthPx: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        const ratio = Math.min(1, maxWidthPx / naturalWidth);
        const targetWidth = Math.max(1, Math.round(naturalWidth * ratio));
        const targetHeight = Math.max(1, Math.round(naturalHeight * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl); // repli : image d'origine si le canvas n'est pas disponible
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(dataUrl); // repli : image d'origine, le rapport reste utilisable
      img.src = dataUrl;
    });
  }

  /**
   * Même redimensionnement/recompression que `optimizeImageForReport`, avec en plus un repère
   * dessiné à la position du clic. `marker` donne la position en coordonnées de PAGE
   * (`pageX`/`pageY`) ainsi que le défilement et la taille du viewport au moment de la capture
   * "avant" (quasi simultanée au clic) — si le repère tombe hors de l'image capturée, on ne le
   * dessine pas plutôt que de placer un repère incohérent.
   */
  private drawScreenshotWithMarker(dataUrl: string, marker: NonNullable<Action['screenshotMarker']>, maxWidthPx: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        const ratio = Math.min(1, maxWidthPx / naturalWidth);
        const targetWidth = Math.max(1, Math.round(naturalWidth * ratio));
        const targetHeight = Math.max(1, Math.round(naturalHeight * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Coordonnées de page -> position dans le viewport capturé -> échelle de l'image finale.
        const viewportX = marker.pageX - marker.scrollX;
        const viewportY = marker.pageY - marker.scrollY;
        const scaleX = (naturalWidth / marker.viewportWidth) * ratio;
        const scaleY = (naturalHeight / marker.viewportHeight) * ratio;
        const markerX = viewportX * scaleX;
        const markerY = viewportY * scaleY;

        if (viewportX >= 0 && viewportX <= marker.viewportWidth && viewportY >= 0 && viewportY <= marker.viewportHeight) {
          ctx.beginPath();
          ctx.arc(markerX, markerY, 11, 0, Math.PI * 2);
          ctx.strokeStyle = '#e02424';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(markerX, markerY, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#e02424';
          ctx.fill();
        }

        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /** Couvre SCREENSHOT/RECORD_BY_IMAGE et les miniatures automatiques (NAVIGATE, clic stabilisé) :
   * aucun autre actionType ne stocke une image dans `data`, un filtre par format suffit. */
  private extractImageDataUrl(action: Action): string | null {
    if (typeof action.data === 'string' && action.data.startsWith('data:image')) {
      return action.data;
    }
    return null;
  }

  /** Reprend les mêmes clés i18n que `action.component.html` pour ne pas dupliquer les libellés de type d'action. */
  private actionTypeLabel(action: Action): string {
    switch (action.actionType) {
      case ActionType.NAVIGATE:
        return this.translate.instant(action.userAction?.type === 'reload' ? 'mmn.spy-http.actions.type.reload' : 'mmn.spy-http.actions.type.navigate');
      case ActionType.SCREENSHOT:
        return this.translate.instant('mmn.spy-http.actions.type.screenshot');
      case ActionType.RECORD_BY_IMAGE:
        return this.translate.instant('mmn.spy-http.actions.type.record.by.img');
      case ActionType.RECORD_BY_LABEL:
        return this.translate.instant('mmn.spy-http.actions.type.record.by.label');
      case ActionType.COMMENT:
        return this.translate.instant('mmn.spy-http.actions.type.comment');
      case ActionType.EVENT:
      default:
        return (action.userAction?.type || '').toLowerCase();
    }
  }

  private actionSummaryText(action: Action): string {
    const userAction = action.userAction;
    const parts: string[] = [];
    if (action.actionType === ActionType.COMMENT && typeof action.data === 'string') {
      parts.push(action.data);
    }
    if (userAction?.hrefLocation) {
      parts.push(userAction.hrefLocation);
    }
    if (userAction?.selector) {
      parts.push(`${this.translate.instant('mmn.report.action.selector')} : ${userAction.selector}`);
    }
    if (userAction?.label) {
      parts.push(`${this.translate.instant('mmn.report.action.label')} : ${userAction.label}`);
    }
    if (userAction?.value) {
      parts.push(`${this.translate.instant('mmn.report.action.value')} : ${userAction.value}`);
    }
    return parts.join(' — ');
  }

  private buildStyles(): string {
    return `
:root {
  color-scheme: light;
  --c-bg: #f8faff;
  --c-text: #2c3e50;
  --c-text-muted: #7f8c8d;
  --c-petrol: #1b5064;
  --c-petrol-light: #417182;
  --c-petrol-pale: #8facb6;
  --c-danger: #e74c3c;
  --c-amber: #d97706;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 32px 16px; background: var(--c-bg); color: var(--c-text); line-height: 1.55; position: relative; }

/* Mêmes bulles flottantes que le fond de la mosaïque, pour une identité visuelle cohérente
   entre le panneau de l'extension et le rapport exporté. */
.bg-blobs { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .55; animation: float 20s infinite alternate ease-in-out; }
.blob-1 { width: 420px; height: 420px; background: #e0f2f1; top: -120px; right: -120px; }
.blob-2 { width: 480px; height: 480px; background: #f3e5f5; bottom: -140px; left: -120px; animation-delay: -5s; }
.blob-3 { width: 320px; height: 320px; background: #e3f2fd; top: 45%; left: 35%; animation-delay: -10s; }
@keyframes float {
  0% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(30px, 50px) rotate(10deg); }
  66% { transform: translate(-20px, 20px) rotate(-10deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
.report-container { position: relative; z-index: 1; max-width: 980px; margin: 0 auto; }

/* En-tête : même dégradé pétrole que la barre d'outils Tuello, avec les statistiques-clés en
   puces de verre pour un aperçu immédiat de la session sans avoir à ouvrir les sections. */
.report-header { background: linear-gradient(to right, #1b5064 0%, #417182 50%, #8facb6 100%); color: #fff; border-radius: 24px; padding: 32px 32px 26px; margin-bottom: 24px; box-shadow: 0 16px 40px rgba(27, 80, 100, .3); }
.report-header h1 { margin: 0 0 4px; font-size: 26px; font-weight: 800; letter-spacing: -.01em; text-shadow: 0 2px 10px rgba(0, 0, 0, .15); }
.report-header .generated-on { color: rgba(255, 255, 255, .85); margin: 0 0 22px; font-size: 13px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px; }
.stat-card { background: rgba(255, 255, 255, .15); border: 1px solid rgba(255, 255, 255, .25); border-radius: 14px; padding: 11px 14px; backdrop-filter: blur(6px); transition: transform .3s cubic-bezier(.175, .885, .32, 1.275); }
.stat-card.stat-card-danger { background: rgba(231, 76, 60, .3); border-color: rgba(255, 210, 210, .5); }
.stat-value { display: block; font-size: 21px; font-weight: 700; line-height: 1.2; }
.stat-label { display: block; font-size: 10.5px; color: rgba(255, 255, 255, .9); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }

/* Cartes de section : même verre dépoli que les tuiles/cartes de résultats de la mosaïque
   (fond translucide + flou), plutôt qu'un simple encadré plat. */
section, details.report-section { background: rgba(255, 255, 255, .78); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, .6); border-radius: 20px; padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 8px 26px rgba(27, 80, 100, .08); }
section h2 { margin: 0 0 14px; font-size: 17px; font-weight: 700; color: var(--c-text); display: flex; align-items: center; }

/* Puce-icône monogramme par type de section (mêmes dégradés que les tuiles/catégories de la
   mosaïque) : repérage visuel immédiat, sans dépendre d'une police d'icônes externe. */
.section-icon { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 9px; font-size: 12px; font-weight: 700; color: #fff; margin-right: 10px; flex-shrink: 0; box-shadow: 0 3px 8px rgba(0, 0, 0, .18); transition: transform .3s cubic-bezier(.175, .885, .32, 1.275); }
.section-icon--metadata { background: linear-gradient(135deg, var(--c-petrol-pale), var(--c-petrol-light)); }
.section-icon--actions { background: linear-gradient(135deg, #4facfe, #00f2fe); }
.section-icon--http { background: linear-gradient(135deg, #a18cd1, #fbc2eb); }
.section-icon--console { background: linear-gradient(135deg, #f6d365, #fda085); }
.section-icon--comparison { background: linear-gradient(135deg, #43e97b, #38f9d7); }

/* Sections repliables (Actions, HTTP, Console) : <details> plutôt que <section>, pour un
   accordéon natif sans JS (hormis les boutons d'export, qui doivent rester cliquables sans
   déclencher le repli/dépli — voir leur onclick avec preventDefault/stopPropagation). */
details.report-section > summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
details.report-section[open] > summary { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid rgba(27, 80, 100, .1); }
details.report-section > summary::-webkit-details-marker { display: none; }
details.report-section > summary:hover .section-icon { transform: scale(1.1) rotate(-4deg); }
.report-section-title { flex: 1; min-width: 0; display: flex; align-items: center; font-size: 17px; font-weight: 700; color: var(--c-text); }
.report-section-arrow { display: inline-block; margin-right: 8px; color: var(--c-text-muted); font-size: 11px; transition: transform .2s ease; }
details.report-section[open] > summary .report-section-arrow { transform: rotate(90deg); }

.metadata-comment { white-space: pre-wrap; margin: 4px 0 0; color: var(--c-text); }
.section--metadata p { margin: 0 0 6px; font-size: 14px; }

.tuello-export-btn { font: 700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 5px 13px; border: 1px solid rgba(27, 80, 100, .15); border-radius: 999px; background: rgba(255, 255, 255, .6); color: var(--c-petrol); cursor: pointer; white-space: nowrap; flex-shrink: 0; backdrop-filter: blur(6px); transition: .2s ease; }
.tuello-export-btn:hover { background: #fff; box-shadow: 0 4px 14px rgba(27, 80, 100, .18); transform: translateY(-1px); }

/* Timeline des actions : badge numéroté en dégradé + libellé en pastille plutôt qu'en texte
   brut, lignes HTTP en pilules de verre comme les cartes de résultats de la mosaïque. */
.action-entry { padding: 10px 2px; border-bottom: 1px solid rgba(27, 80, 100, .06); }
.action-entry:last-child { border-bottom: none; }
.action-entry .action-header { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.action-index { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; background: linear-gradient(135deg, #4facfe, #00f2fe); color: #fff; font-size: 11px; font-weight: 700; box-shadow: 0 3px 8px rgba(79, 172, 254, .35); }
.action-type { background: rgba(127, 140, 141, .14); color: #54656a; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.action-delay { margin-left: auto; color: var(--c-text-muted); font-weight: 400; font-size: 11.5px; white-space: nowrap; }
.action-image { max-width: 600px; margin-top: 8px; border: 1px solid rgba(255, 255, 255, .6); border-radius: 14px; display: block; box-shadow: 0 4px 16px rgba(27, 80, 100, .1); }
.action-text { color: #444; font-size: 13px; margin: 6px 0 0; word-break: break-all; width: 100%; }
.action-http-link { display: flex; align-items: center; gap: 8px; padding: 8px 14px; margin: 4px 0; border-radius: 14px; background: rgba(255, 255, 255, .55); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, .5); text-decoration: none; color: inherit; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; box-shadow: 0 2px 10px rgba(27, 80, 100, .05); transition: .25s ease; width: 100%; }
.action-http-link:hover { background: rgba(255, 255, 255, .9); transform: translateY(-1px); box-shadow: 0 8px 18px rgba(27, 80, 100, .14); }
.action-http-link.http-error { border-color: rgba(231, 76, 60, .35); }
.action-http-badge { font-size: 10px; font-weight: 700; letter-spacing: .04em; color: var(--c-petrol); background: rgba(79, 172, 254, .18); padding: 1px 7px; border-radius: 10px; }
.action-http-highlight { font-size: 11px; font-weight: 700; color: #92600c; background: rgba(253, 187, 45, .22); padding: 1px 9px; border-radius: 10px; word-break: break-all; }

/* Donnée mise en évidence (choisie sur la page Rapport avant génération, voir ReportComponent) :
   pastille ambre cohérente avec le reste du rapport. */
.http-highlight { margin: 10px 0 0 4px; font-size: 12px; font-weight: 700; color: #92600c; background: rgba(253, 187, 45, .18); padding: 6px 10px; border-radius: 10px; word-break: break-all; }

/* Badges méthode/code HTTP : pilules de verre teintées (même esprit que les chips de la
   mosaïque), une couleur par verbe/classe de code pour un repérage visuel immédiat. */
.badge { display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 999px; line-height: 1.6; font-family: 'SFMono-Regular', Consolas, monospace; white-space: nowrap; }
.badge-method-get { background: rgba(79, 172, 254, .16); color: #1464c2; }
.badge-method-post { background: rgba(67, 233, 123, .2); color: #15803d; }
.badge-method-put { background: rgba(253, 187, 45, .22); color: #b45309; }
.badge-method-delete { background: rgba(231, 76, 60, .18); color: #c0392b; }
.badge-method-other { background: rgba(127, 140, 141, .16); color: #54656a; }
.badge-code-2xx { background: rgba(67, 233, 123, .2); color: #15803d; }
.badge-code-3xx { background: rgba(79, 172, 254, .16); color: #1464c2; }
.badge-code-4xx { background: rgba(253, 187, 45, .22); color: #b45309; }
.badge-code-5xx { background: rgba(231, 76, 60, .18); color: #c0392b; }
.badge-code-other { background: rgba(127, 140, 141, .16); color: #54656a; }

/* Barre de recherche live (voir buildHttpSearchScript) : même esprit "pilule de verre" que le
   reste du rapport, fixée en haut de la section HTTP pour rester visible en faisant défiler
   la liste des requêtes. */
.tuello-http-search { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 6px 8px; background: rgba(255, 255, 255, .85); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, .6); border-radius: 12px; box-shadow: 0 4px 14px rgba(27, 80, 100, .08); }
.tuello-http-search-input { flex: 1; min-width: 0; border: none; background: transparent; font: 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--c-text); outline: none; padding: 4px 6px; }
.tuello-http-search-count { font-size: 11px; color: var(--c-text-muted); white-space: nowrap; min-width: 32px; text-align: right; }
.tuello-http-search-nav { border: 1px solid rgba(27, 80, 100, .15); background: rgba(255, 255, 255, .6); color: var(--c-petrol); border-radius: 8px; width: 26px; height: 26px; line-height: 1; cursor: pointer; font-size: 10px; flex-shrink: 0; transition: .2s ease; }
.tuello-http-search-nav:hover { background: #fff; box-shadow: 0 3px 10px rgba(27, 80, 100, .15); }
mark.tuello-search-mark { background: rgba(253, 187, 45, .55); color: inherit; border-radius: 3px; padding: 0 1px; }
mark.tuello-search-mark--active { background: var(--c-amber); color: #fff; }
.http-entry.tuello-dimmed { opacity: .35; }

.http-entry { border: 1px solid rgba(255, 255, 255, .6); background: rgba(255, 255, 255, .4); border-radius: 14px; padding: 11px 16px; margin-bottom: 8px; scroll-margin-top: 16px; transition: outline-color .15s ease, background .2s ease; }
.http-entry:hover { background: rgba(255, 255, 255, .65); }
.http-entry:target { outline: 2px solid var(--c-petrol-light); outline-offset: 2px; }
.http-entry summary { cursor: pointer; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.http-summary-text { flex: 1; min-width: 0; overflow-wrap: anywhere; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.http-duration.http-slow { color: var(--c-amber); font-weight: 700; }
.http-url { word-break: break-all; color: var(--c-text); }
.http-subsection { margin: 12px 0 0 4px; }
.http-subsection-title { font-weight: 700; font-size: 11px; color: var(--c-text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
.http-screenshot { max-width: 100%; border: 1px solid rgba(255, 255, 255, .6); border-radius: 14px; display: block; box-shadow: 0 4px 16px rgba(27, 80, 100, .1); }

/* Logs console : fond et liseré colorés selon le niveau, pour repérer les erreurs/avertissements
   sans avoir à lire chaque ligne. */
.console-entry { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12.5px; padding: 7px 12px; border-radius: 10px; margin-bottom: 4px; background: rgba(255, 255, 255, .45); border-left: 3px solid rgba(127, 140, 141, .4); }
.console-entry:last-child { margin-bottom: 0; }
.console-entry.console-error { background: rgba(231, 76, 60, .1); border-left-color: var(--c-danger); color: #922b21; }
.console-entry.console-warn { background: rgba(253, 187, 45, .14); border-left-color: var(--c-amber); color: #92600c; }
.console-level { font-weight: 700; margin-right: 6px; }
.console-time { opacity: .65; margin-right: 6px; }

.comparison-entry { margin-bottom: 20px; }
.comparison-entry:last-child { margin-bottom: 0; }
.comparison-header { font-weight: 700; margin-bottom: 8px; font-size: 14px; }
.comparison-images { display: flex; gap: 12px; flex-wrap: wrap; }
.comparison-images figure { margin: 0; }
.comparison-images img { max-width: 260px; border: 1px solid rgba(255, 255, 255, .6); border-radius: 14px; display: block; box-shadow: 0 4px 16px rgba(27, 80, 100, .1); }
.comparison-images figcaption { font-size: 11px; color: var(--c-text-muted); margin-bottom: 4px; }

details { margin: 2px 0; }
summary { outline: none; }
summary.tree-summary { cursor: pointer; font-family: monospace; font-size: 12px; color: var(--c-text-muted); }
.tree-children { margin-left: 18px; border-left: 1px dashed rgba(27, 80, 100, .2); padding-left: 10px; }
.tree-row { font-family: monospace; font-size: 12px; margin: 2px 0; }
.tree-key { color: var(--c-petrol-light); margin-right: 4px; }
.tree-string { color: #0a7a2f; }
.tree-number { color: #1464c2; }
.tree-boolean { color: #b4530a; }
.tree-null { color: #999; font-style: italic; }
.tree-meta { color: #999; font-family: monospace; font-size: 12px; }
.tree-plaintext { white-space: pre-wrap; word-break: break-all; font-size: 12px; background: rgba(0, 0, 0, .03); padding: 8px; border-radius: 8px; margin: 0; }

@media (max-width: 560px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  section, details.report-section { padding: 16px 18px; }
}
@media print {
  body { background: #fff; padding: 0; }
  .bg-blobs { display: none; }
  .report-header { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  section, details.report-section { box-shadow: none; backdrop-filter: none; background: #fff; }
  .tuello-export-btn { display: none; }
  .tuello-http-search { display: none; }
  .http-entry.tuello-dimmed { opacity: 1; }
}
`;
  }
}
