import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MosaicCategory, MosaicConfig, MosaicUrl, MOSAIC_CONFIG_KEY } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicStorageService {
  private configSubject = new BehaviorSubject<MosaicConfig>(this.defaultConfig());
  config$ = this.configSubject.asObservable();

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

  async addUrl(categoryId: string, url: string, title: string): Promise<MosaicUrl> {
    const config = { ...this.configSubject.getValue() };
    config.categories = config.categories.map((c) => {
      if (c.id !== categoryId) return c;
      const newUrl: MosaicUrl = { id: this.generateId(), url, title, order: c.urls.length };
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

  async addRootUrl(url: string, title: string): Promise<MosaicUrl> {
    const config = { ...this.configSubject.getValue() };
    config.urls = [...(config.urls ?? [])];
    const newUrl: MosaicUrl = { id: this.generateId(), url, title, order: config.urls.length };
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

  async toggleOpenOnStartup(value: boolean): Promise<void> {
    const config = { ...this.configSubject.getValue(), openOnStartup: value };
    await this.saveConfig(config);
  }

  exportConfig(): string {
    return JSON.stringify(this.configSubject.getValue(), null, 2);
  }

  async importConfig(jsonString: string): Promise<void> {
    const config = JSON.parse(jsonString) as MosaicConfig;
    await this.saveConfig(config);
  }
}
