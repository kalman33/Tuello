import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ScenarioStorageService } from '../../core/scenarios/scenario-storage.service';
import { MosaicCategory, MosaicConfig, MosaicExport, MosaicImportResult, MosaicUrl, MOSAIC_CONFIG_KEY } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicStorageService {
  private configSubject = new BehaviorSubject<MosaicConfig>(this.defaultConfig());
  config$ = this.configSubject.asObservable();

  private scenarioStorageService = inject(ScenarioStorageService);

  private defaultConfig(): MosaicConfig {
    return { version: 1, categories: [], urls: [], openOnStartup: false };
  }

  async loadConfig(): Promise<MosaicConfig> {
    return new Promise((resolve) => {
      chrome.storage.local.get([MOSAIC_CONFIG_KEY], (result: Record<string, any>) => {
        const config: MosaicConfig = result[MOSAIC_CONFIG_KEY] ?? this.defaultConfig();
        this.configSubject.next(config);
        resolve(config);
      });
    });
  }

  async saveConfig(config: MosaicConfig): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [MOSAIC_CONFIG_KEY]: config }, () => {
        this.configSubject.next({ ...config });
        resolve();
      });
    });
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async addCategory(name: string): Promise<MosaicCategory> {
    const config = { ...this.configSubject.getValue() };
    config.categories = [...config.categories];
    const category: MosaicCategory = {
      id: this.generateId(),
      name,
      order: config.categories.length,
      urls: []
    };
    config.categories.push(category);
    await this.saveConfig(config);
    return category;
  }

  async updateCategory(updated: MosaicCategory): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => (c.id === updated.id ? updated : c));
    await this.saveConfig(config);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.filter((c) => c.id !== categoryId);
    await this.saveConfig(config);
  }

  async reorderCategories(categories: MosaicCategory[]): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = categories.map((c, i) => ({ ...c, order: i }));
    await this.saveConfig(config);
  }

  async addUrl(categoryId: string, url: string, title: string, scenarioId?: string): Promise<MosaicUrl> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => {
      if (c.id !== categoryId) return c;
      const newUrl: MosaicUrl = { id: this.generateId(), url, title, order: c.urls.length, scenarioId };
      return { ...c, urls: [...c.urls, newUrl] };
    });
    await this.saveConfig(config);
    const category = config.categories.find((c) => c.id === categoryId);
    return category!.urls[category!.urls.length - 1];
  }

  async updateUrl(categoryId: string, updated: MosaicUrl): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => {
      if (c.id !== categoryId) return c;
      return { ...c, urls: c.urls.map((u) => (u.id === updated.id ? updated : u)) };
    });
    await this.saveConfig(config);
  }

  async deleteUrl(categoryId: string, urlId: string): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => {
      if (c.id !== categoryId) return c;
      return { ...c, urls: c.urls.filter((u) => u.id !== urlId) };
    });
    await this.saveConfig(config);
  }

  async reorderUrls(categoryId: string, urls: MosaicUrl[]): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => {
      if (c.id !== categoryId) return c;
      return { ...c, urls: urls.map((u, i) => ({ ...u, order: i })) };
    });
    await this.saveConfig(config);
  }

  async addRootUrl(url: string, title: string, scenarioId?: string): Promise<MosaicUrl> {
    const config = { ...this.configSubject.getValue() };
    config.urls = [...(config.urls ?? [])];
    const newUrl: MosaicUrl = { id: this.generateId(), url, title, order: config.urls.length, scenarioId };
    config.urls.push(newUrl);
    await this.saveConfig(config);
    return newUrl;
  }

  async updateRootUrl(updated: MosaicUrl): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.urls = (config.urls ?? []).map((u) => (u.id === updated.id ? updated : u));
    await this.saveConfig(config);
  }

  async deleteRootUrl(urlId: string): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.urls = (config.urls ?? []).filter((u) => u.id !== urlId);
    await this.saveConfig(config);
  }

  async reorderRootUrls(urls: MosaicUrl[]): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.urls = urls.map((u, i) => ({ ...u, order: i }));
    await this.saveConfig(config);
  }

  async reorderGridItems(categories: MosaicCategory[], urls: MosaicUrl[]): Promise<void> {
    const config = { ...this.configSubject.getValue() };
    config.categories = categories;
    config.urls = urls;
    await this.saveConfig(config);
  }

  /**
   * Déplace un site d'un conteneur à l'autre — une catégorie, ou la racine quand
   * l'id vaut `null`. Retrait et insertion sont écrits en une seule fois : en deux
   * étapes, un échec entre les deux laisserait le site nulle part.
   */
  async moveUrl(fromCategoryId: string | null, toCategoryId: string | null, urlId: string, toIndex: number): Promise<void> {
    const current = this.configSubject.getValue();
    const rootUrls = [...(current.urls ?? [])].sort((a, b) => a.order - b.order);
    const categories = current.categories.map((c) => ({ ...c, urls: [...c.urls].sort((a, b) => a.order - b.order) }));

    const containerOf = (id: string | null): MosaicUrl[] | undefined => (id === null ? rootUrls : categories.find((c) => c.id === id)?.urls);
    const source = containerOf(fromCategoryId);
    const target = containerOf(toCategoryId);
    if (!source || !target) {
      return;
    }

    const fromIndex = source.findIndex((u) => u.id === urlId);
    if (fromIndex === -1) {
      return;
    }
    const [moved] = source.splice(fromIndex, 1);
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, moved);

    const config: MosaicConfig = {
      ...current,
      urls: this.reassignRootOrders(current, rootUrls),
      categories: categories.map((c) => ({ ...c, urls: c.urls.map((u, i) => ({ ...u, order: i })) }))
    };
    await this.saveConfig(config);
  }

  /**
   * Réaffecte aux sites racine les valeurs d'ordre déjà en place au lieu de
   * renuméroter à partir de 0 : dans la vue mosaïque ces ordres sont partagés avec
   * ceux des catégories (cf. reorderGridItems), et repartir de 0 ferait remonter
   * tous les sites racine devant les catégories dans la grille.
   */
  private reassignRootOrders(current: MosaicConfig, rootUrls: MosaicUrl[]): MosaicUrl[] {
    const slots = (current.urls ?? []).map((u) => u.order).sort((a, b) => a - b);
    let next = Math.max(-1, ...current.categories.map((c) => c.order), ...slots) + 1;
    while (slots.length < rootUrls.length) {
      slots.push(next++);
    }
    slots.length = rootUrls.length;
    return rootUrls.map((u, i) => ({ ...u, order: slots[i] }));
  }

  /**
   * Retire toute association vers un scénario supprimé : sans ce nettoyage, les
   * sites gardent un scenarioId orphelin qui ne correspond plus à rien.
   */
  async removeScenarioReferences(scenarioId: string): Promise<void> {
    // Relecture obligatoire : appelé depuis Spy & Replay, où la config mosaïque
    // n'a pas forcément été chargée dans ce service.
    const config = { ...(await this.loadConfig()) };
    const detach = (u: MosaicUrl): MosaicUrl => (u.scenarioId === scenarioId ? { ...u, scenarioId: undefined } : u);
    const hasReference = [...(config.urls ?? []), ...config.categories.flatMap((c) => c.urls)].some((u) => u.scenarioId === scenarioId);
    if (!hasReference) {
      return;
    }
    config.urls = (config.urls ?? []).map(detach);
    config.categories = config.categories.map((c) => ({ ...c, urls: c.urls.map(detach) }));
    await this.saveConfig(config);
  }

  async toggleOpenOnStartup(value: boolean): Promise<void> {
    const config = { ...this.configSubject.getValue(), openOnStartup: value };
    await this.saveConfig(config);
  }

  /**
   * Exporte la configuration accompagnée des scénarios qu'elle référence, pour
   * que les associations restent fonctionnelles après import sur un autre poste.
   */
  async exportConfig(): Promise<string> {
    const config = this.configSubject.getValue();
    const referencedIds = this.referencedScenarioIds(config);
    const scenarios = (await this.scenarioStorageService.load()).filter((scenario) => referencedIds.has(scenario.id));
    const data: MosaicExport = { ...config, scenarios };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Importe une configuration : les scénarios joints sont ajoutés à la liste
   * locale, et toute association restée sans scénario correspondant est retirée.
   */
  async importConfig(jsonString: string): Promise<MosaicImportResult> {
    const data = JSON.parse(jsonString) as MosaicExport;
    const importedScenarios = await this.scenarioStorageService.importScenarios(data.scenarios ?? []);

    const knownIds = new Set((await this.scenarioStorageService.load()).map((scenario) => scenario.id));
    let droppedReferences = 0;
    const checkUrl = (url: MosaicUrl): MosaicUrl => {
      if (url.scenarioId && !knownIds.has(url.scenarioId)) {
        droppedReferences++;
        return { ...url, scenarioId: undefined };
      }
      return url;
    };

    const config: MosaicConfig = {
      version: data.version,
      openOnStartup: data.openOnStartup,
      urls: (data.urls ?? []).map(checkUrl),
      categories: (data.categories ?? []).map((category) => ({ ...category, urls: (category.urls ?? []).map(checkUrl) }))
    };
    await this.saveConfig(config);
    return { importedScenarios, droppedReferences };
  }

  /** Ids des scénarios associés à au moins un site de la configuration */
  private referencedScenarioIds(config: MosaicConfig): Set<string> {
    const ids = [...(config.urls ?? []), ...config.categories.flatMap((category) => category.urls ?? [])].map((url) => url.scenarioId).filter((id): id is string => !!id);
    return new Set(ids);
  }
}
