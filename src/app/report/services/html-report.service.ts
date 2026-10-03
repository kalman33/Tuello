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

@Injectable({ providedIn: 'root' })
export class HtmlReportService {
  constructor(private translate: TranslateService) {}

  async generateReport(record: Record, comparisonResults?: ComparisonResult[]): Promise<void> {
    // record.httpRecords est alimenté via unshift (ordre antichronologique) : on calcule l'ordre
    // chronologique une seule fois, partagé entre la section Actions (entrelacement) et la
    // section HTTP (ancres), pour que les index d'ancre correspondent exactement.
    const chronologicalHttp = (record.httpRecords || []).slice().reverse();

    const sections: string[] = [this.buildHeader(record, comparisonResults)];

    if (record.actions?.length) {
      sections.push(await this.buildActionsSection(record.actions, chronologicalHttp));
    }
    if (chronologicalHttp.length) {
      sections.push(await this.buildHttpSection(chronologicalHttp));
    }
    if (record.consoleLogs?.length) {
      sections.push(this.buildConsoleSection(record.consoleLogs));
    }
    if (comparisonResults?.length) {
      sections.push(await this.buildComparisonSection(comparisonResults));
    }

    const html = this.buildDocument(sections.join('\n'));
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `tuello-report-${formatDate(new Date())}.html`);
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
${bodyContent}
</body>
</html>`;
  }

  private buildHeader(record: Record, comparisonResults?: ComparisonResult[]): string {
    const httpErrors = (record.httpRecords || []).filter((http) => Number(http.httpCode) >= 400).length;
    const consoleErrors = (record.consoleLogs || []).filter((entry) => entry.level === 'error').length;

    return `<header>
  <h1>${this.escapeHtml(this.translate.instant('mmn.report.export.title'))}</h1>
  <p class="generated-on">${this.escapeHtml(this.translate.instant('mmn.report.export.generatedOn'))} ${this.escapeHtml(new Date().toLocaleString())}</p>
  <ul class="summary">
    <li>${this.escapeHtml(this.translate.instant('mmn.report.summary.actions'))} : ${record.actions?.length ?? 0}</li>
    <li>${this.escapeHtml(this.translate.instant('mmn.report.summary.httpRequests'))} : ${record.httpRecords?.length ?? 0}</li>
    <li>${this.escapeHtml(this.translate.instant('mmn.report.summary.httpErrors'))} : ${httpErrors}</li>
    <li>${this.escapeHtml(this.translate.instant('mmn.report.summary.consoleLogs'))} : ${record.consoleLogs?.length ?? 0} (${this.escapeHtml(this.translate.instant('mmn.report.summary.consoleErrors'))} : ${consoleErrors})</li>
    <li>${this.escapeHtml(this.translate.instant('mmn.report.summary.comparisonResults'))} : ${comparisonResults?.length ?? 0}</li>
  </ul>
</header>`;
  }

  /**
   * Entrelace les actions et les requêtes HTTP par ordre chronologique réel (timestamp), pas
   * seulement par position dans leurs tableaux respectifs. Chaque requête HTTP est un lien
   * cliquable vers son ancre dans la section "Requêtes HTTP" (même index que `buildHttpSection`,
   * les deux méthodes reçoivent le même tableau `chronologicalHttp`).
   */
  private async buildActionsSection(actions: Action[], chronologicalHttp: HttpReturn[]): Promise<string> {
    const timeline: Array<{ timestamp: number; html: string }> = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const imageData = this.extractImageDataUrl(action);
      let body: string;

      if (imageData) {
        // Capture "avant" (clic) : repère dessiné si on connaît la position du clic.
        const optimized = action.screenshotMarker ? await this.drawScreenshotWithMarker(imageData, action.screenshotMarker, 900) : await this.optimizeImageForReport(imageData, 900);
        body = `<img class="action-image" src="${optimized}" alt="" />`;
      } else {
        const text = this.actionSummaryText(action);
        body = text ? `<p class="action-text">${this.escapeHtml(text)}</p>` : '';
      }

      const html = `<div class="action-entry">
  <div class="action-header"><span class="action-index">${i + 1}.</span> <span class="action-type">${this.escapeHtml(this.actionTypeLabel(action))}</span> <span class="action-delay">${action.delay} ms</span></div>
  ${body}
</div>`;
      timeline.push({ timestamp: action.timestamp ?? 0, html });
    }

    for (let index = 0; index < chronologicalHttp.length; index++) {
      const http = chronologicalHttp[index];
      const code = Number(http.httpCode);
      const isError = !Number.isNaN(code) && code >= 400;

      // Capture "après" (fin d'appel HTTP, DOM stabilisé) : pas de repère, la page a déjà changé.
      const screenshotHtml = http.screenshot ? `<img class="action-image" src="${await this.optimizeImageForReport(http.screenshot, 900)}" alt="" />` : '';

      const html = `<a class="action-http-link${isError ? ' http-error' : ''}" href="#http-entry-${index}">
  <span class="action-http-badge">HTTP</span>
  <span class="http-method">${this.escapeHtml(http.method || '?')}</span>
  <span class="http-code${isError ? ' http-error' : ''}">[${this.escapeHtml(String(http.httpCode ?? '?'))}]</span>
  <span class="http-url">${this.escapeHtml(http.key)}</span>
</a>
${screenshotHtml}`;
      timeline.push({ timestamp: http.timestamp ?? 0, html });
    }

    // Tri stable (ES2019+) : à timestamp égal, l'ordre d'insertion ci-dessus est conservé.
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return `<section>
  <h2>${this.escapeHtml(this.translate.instant('mmn.report.section.actions.title'))}</h2>
  ${timeline.map((item) => item.html).join('\n')}
</section>`;
  }

  private async buildHttpSection(chronologicalHttp: HttpReturn[]): Promise<string> {
    const rows: string[] = [];

    for (let index = 0; index < chronologicalHttp.length; index++) {
      const http = chronologicalHttp[index];
      const code = Number(http.httpCode);
      const isError = !Number.isNaN(code) && code >= 400;
      const isSlow = typeof http.duration === 'number' && http.duration > 1000;
      const duration = typeof http.duration === 'number' ? `${http.duration} ms` : '—';

      const summary = `<span class="http-method">${this.escapeHtml(http.method || '?')}</span> <span class="http-code${isError ? ' http-error' : ''}">[${this.escapeHtml(String(http.httpCode ?? '?'))}]</span> <span class="http-duration${isSlow ? ' http-slow' : ''}">${this.escapeHtml(duration)}</span> <span class="http-url">${this.escapeHtml(http.key)}</span>`;

      const bodySection = this.renderJsonSection(this.translate.instant('mmn.report.http.requestBody'), http.body);
      const responseSection = this.renderJsonSection(this.translate.instant('mmn.report.http.response'), http.response);

      rows.push(
        `<details class="http-entry" id="http-entry-${index}">
  <summary>${summary}</summary>
  ${bodySection}${responseSection}
</details>`
      );
    }

    return `<section>
  <h2>${this.escapeHtml(this.translate.instant('mmn.report.section.http.title'))}</h2>
  ${rows.join('\n')}
</section>`;
  }

  private buildConsoleSection(entries: ConsoleLogEntry[]): string {
    const rows = entries
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `<div class="console-entry console-${entry.level}"><span class="console-level">[${entry.level.toUpperCase()}]</span> <span class="console-time">${this.escapeHtml(time)}</span> <span class="console-message">${this.escapeHtml(entry.message)}</span></div>`;
      })
      .join('\n');

    return `<section>
  <h2>${this.escapeHtml(this.translate.instant('mmn.report.section.console.title'))}</h2>
  ${rows}
</section>`;
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

    return `<section>
  <h2>${this.escapeHtml(this.translate.instant('mmn.report.section.comparison.title'))}</h2>
  ${parts.join('\n')}
</section>`;
  }

  /** Affiche `raw` (déjà parsé, ou chaîne JSON à parser, ou texte brut en repli) comme sous-section repliable. */
  private renderJsonSection(label: string, raw: unknown): string {
    if (raw === undefined || raw === null || raw === '') {
      return '';
    }

    let value: unknown = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        return `<div class="http-subsection">
  <div class="http-subsection-title">${this.escapeHtml(label)}</div>
  <pre class="tree-plaintext">${this.escapeHtml(raw)}</pre>
</div>`;
      }
    }

    return `<div class="http-subsection">
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
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f5f6f8; color: #1a1a1a; line-height: 1.5; }
header { margin-bottom: 24px; }
h1 { margin: 0 0 4px; font-size: 24px; }
.generated-on { color: #666; margin: 0 0 16px; font-size: 13px; }
.summary { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; max-width: 480px; }
.summary li { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
section { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
section h2 { margin-top: 0; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
.action-entry { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.action-entry:last-child { border-bottom: none; }
.action-header { display: flex; gap: 8px; align-items: baseline; font-weight: 600; font-size: 14px; }
.action-delay { margin-left: auto; color: #888; font-weight: 400; font-size: 12px; }
.action-image { max-width: 100%; margin-top: 8px; border: 1px solid #ddd; border-radius: 4px; display: block; }
.action-text { color: #444; font-size: 13px; margin: 6px 0 0; word-break: break-all; }
.action-http-link { display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin: 4px 0; border-radius: 6px; background: #f1f2f6; text-decoration: none; color: inherit; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; border-left: 3px solid #9aa0ae; }
.action-http-link:hover { background: #e6e8ee; }
.action-http-link.http-error { border-left-color: #c81e1e; }
.action-http-badge { font-size: 10px; font-weight: 700; letter-spacing: .04em; color: #555; background: #e2e4ea; padding: 1px 6px; border-radius: 10px; }
.http-entry { border: 1px solid #eee; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; scroll-margin-top: 16px; }
.http-entry:target { outline: 2px solid #1a56db; outline-offset: 2px; }
.http-entry summary { cursor: pointer; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; }
.http-method { font-weight: 700; display: inline-block; min-width: 46px; }
.http-code.http-error { color: #c81e1e; font-weight: 700; }
.http-duration.http-slow { color: #c87800; font-weight: 700; }
.http-url { word-break: break-all; }
.http-subsection { margin: 10px 0 0 16px; }
.http-subsection-title { font-weight: 600; font-size: 11px; color: #555; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
.http-screenshot { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; display: block; }
.console-entry { font-family: monospace; font-size: 13px; padding: 4px 0; border-bottom: 1px solid #f5f5f5; }
.console-entry:last-child { border-bottom: none; }
.console-error { color: #c81e1e; }
.console-warn { color: #c87800; }
.comparison-entry { margin-bottom: 20px; }
.comparison-entry:last-child { margin-bottom: 0; }
.comparison-header { font-weight: 600; margin-bottom: 8px; font-size: 14px; }
.comparison-images { display: flex; gap: 12px; flex-wrap: wrap; }
.comparison-images figure { margin: 0; }
.comparison-images img { max-width: 260px; border: 1px solid #ddd; border-radius: 4px; display: block; }
.comparison-images figcaption { font-size: 11px; color: #666; margin-bottom: 4px; }
details { margin: 2px 0; }
summary { outline: none; }
summary.tree-summary { cursor: pointer; font-family: monospace; font-size: 12px; color: #555; }
.tree-children { margin-left: 18px; border-left: 1px dashed #ddd; padding-left: 10px; }
.tree-row { font-family: monospace; font-size: 12px; margin: 2px 0; }
.tree-key { color: #8a3ab2; margin-right: 4px; }
.tree-string { color: #0a7a2f; }
.tree-number { color: #1a56db; }
.tree-boolean { color: #b4530a; }
.tree-null { color: #999; font-style: italic; }
.tree-meta { color: #999; font-family: monospace; font-size: 12px; }
.tree-plaintext { white-space: pre-wrap; word-break: break-all; font-size: 12px; background: #f8f8f8; padding: 8px; border-radius: 4px; margin: 0; }
@media print { body { background: #fff; } section { border: none; } }
`;
  }
}
