import { MosaicConfig, MosaicUrl, MOSAIC_CONFIG_KEY } from '../../../src/app/mosaic/models/mosaic.models';

/**
 * Menu contextuel « Ajouter à la mosaïque » : ajoute la page courante (ou le lien
 * survolé) à la racine ou dans une catégorie, sans ouvrir la mosaïque.
 *
 * Les sous-menus reflètent les catégories : ils sont reconstruits à chaque
 * modification de la configuration et à chaque changement de langue.
 */
const MOSAIC_MENU_ID = 'tuelloMosaicAdd';
const MOSAIC_MENU_ROOT_ID = `${MOSAIC_MENU_ID}:root`;
const MOSAIC_MENU_SEPARATOR_ID = `${MOSAIC_MENU_ID}:separator`;
const MOSAIC_MENU_CATEGORY_PREFIX = `${MOSAIC_MENU_ID}:category:`;

/** Les pages internes du navigateur ne reçoivent pas le content script (toast) et n'ont rien à faire dans la mosaïque */
const DOCUMENT_URL_PATTERNS = ['http://*/*', 'https://*/*'];

/** Reconstructions sérialisées : deux appels rapprochés (sauvegarde + langue) créeraient des ids en double */
let rebuildQueue: Promise<void> = Promise.resolve();

async function loadConfig(): Promise<MosaicConfig | undefined> {
  return (await chrome.storage.local.get<Record<string, any>>([MOSAIC_CONFIG_KEY]))[MOSAIC_CONFIG_KEY];
}

async function loadMessages(): Promise<Record<string, string> | undefined> {
  return (await chrome.storage.local.get<Record<string, any>>(['messages'])).messages?.default;
}

function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => params[key] ?? match);
}

function removeMenu(id: string): Promise<void> {
  return new Promise((resolve) => chrome.contextMenus.remove(id, () => resolve(void chrome.runtime.lastError)));
}

function createMenu(properties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve) => chrome.contextMenus.create(properties, () => resolve(void chrome.runtime.lastError)));
}

async function rebuild(): Promise<void> {
  const [config, msgs] = await Promise.all([loadConfig(), loadMessages()]);
  const categories = [...(config?.categories ?? [])].sort((a, b) => a.order - b.order);
  const contexts: chrome.contextMenus.CreateProperties['contexts'] = ['page', 'link'];

  // Supprimer le parent supprime aussi ses sous-menus
  await removeMenu(MOSAIC_MENU_ID);
  // Sans catégorie, un sous-menu à une seule entrée serait un clic inutile : le parent ajoute directement à la racine
  await createMenu({ id: MOSAIC_MENU_ID, title: msgs?.['mmn.mosaic.menu.add'] || 'Add to mosaic', contexts, documentUrlPatterns: DOCUMENT_URL_PATTERNS });
  if (!categories.length) {
    return;
  }
  await createMenu({ id: MOSAIC_MENU_ROOT_ID, parentId: MOSAIC_MENU_ID, title: msgs?.['mmn.mosaic.menu.root'] || 'Root', contexts });
  await createMenu({ id: MOSAIC_MENU_SEPARATOR_ID, parentId: MOSAIC_MENU_ID, type: 'separator', contexts });
  for (const category of categories) {
    await createMenu({ id: `${MOSAIC_MENU_CATEGORY_PREFIX}${category.id}`, parentId: MOSAIC_MENU_ID, title: category.name, contexts });
  }
}

/** (Re)crée le menu « Ajouter à la mosaïque » d'après la configuration et la langue courantes */
export function rebuildMosaicMenu(): Promise<void> {
  rebuildQueue = rebuildQueue.then(rebuild).catch(console.error);
  return rebuildQueue;
}

/** Ajoute l'entrée et renvoie le texte du toast de confirmation */
async function addToMosaic(menuItemId: string, url: string, title: string): Promise<string> {
  const msgs = await loadMessages();
  const config: MosaicConfig = (await loadConfig()) ?? { version: 1, categories: [], urls: [], openOnStartup: false };
  const rootLabel = msgs?.['mmn.mosaic.menu.root'] || 'Root';

  const categoryId = menuItemId.startsWith(MOSAIC_MENU_CATEGORY_PREFIX) ? menuItemId.slice(MOSAIC_MENU_CATEGORY_PREFIX.length) : null;
  const category = categoryId ? config.categories.find((c) => c.id === categoryId) : undefined;
  if (categoryId && !category) {
    // Catégorie supprimée entre l'affichage du menu et le clic
    rebuildMosaicMenu();
    return msgs?.['mmn.mosaic.menu.missing'] || 'Tuello: this category no longer exists';
  }

  const targetUrls = category ? category.urls : (config.urls ?? []);
  const targetName = category ? category.name : rootLabel;
  if (targetUrls.some((u) => u.url === url)) {
    return interpolate(msgs?.['mmn.mosaic.menu.duplicate'] || 'Tuello: this site is already in « {{category}} »', { category: targetName });
  }

  const entry: MosaicUrl = { id: crypto.randomUUID(), url, title, order: targetUrls.length };
  const updated: MosaicConfig = category ? { ...config, categories: config.categories.map((c) => (c.id === category.id ? { ...c, urls: [...c.urls, entry] } : c)) } : { ...config, urls: [...(config.urls ?? []), entry] };
  await chrome.storage.local.set({ [MOSAIC_CONFIG_KEY]: updated });

  return interpolate(msgs?.['mmn.mosaic.menu.added'] || 'Tuello: « {{title}} » added to « {{category}} »', { title, category: targetName });
}

function titleFor(info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined, url: string): string {
  if (!info.linkUrl && tab?.title) {
    return tab.title;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = String(info.menuItemId);
  if (!menuItemId.startsWith(MOSAIC_MENU_ID)) {
    return;
  }
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (!url) {
    return;
  }
  const text = await addToMosaic(menuItemId, url, titleFor(info, tab, url));
  if (tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { action: 'SHOW_TOAST', value: text }, { frameId: 0 }, () => chrome.runtime.lastError);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes[MOSAIC_CONFIG_KEY] || changes['messages'])) {
    rebuildMosaicMenu();
  }
});
