import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';

/** Sites d'une section ; un nom vide désigne les sites sans section */
export interface MosaicSection {
  name: string;
  urls: MosaicUrl[];
}

/** Site épinglé, avec la catégorie qui le contient (`null` à la racine) */
export interface MosaicPin {
  url: MosaicUrl;
  categoryName: string | null;
}

/** Sites sans section d'abord, puis une section par nom, dans l'ordre d'apparition */
export function buildSections(urls: MosaicUrl[]): MosaicSection[] {
  const byName = new Map<string, MosaicUrl[]>();
  for (const url of urls) {
    const name = url.group?.trim() ?? '';
    const section = byName.get(name);
    if (section) {
      section.push(url);
    } else {
      byName.set(name, [url]);
    }
  }
  const sections = Array.from(byName, ([name, sectionUrls]) => ({ name, urls: sectionUrls }));
  return sections.sort((a, b) => Number(!!a.name) - Number(!!b.name));
}

/** Liste à persister : l'ordre des sections est conservé et chaque site porte celle où il se trouve */
export function flattenSections(sections: MosaicSection[]): MosaicUrl[] {
  return sections.flatMap((section) => section.urls.map((url) => ({ ...url, group: section.name || undefined })));
}

/** Noms des sections existantes, pour les proposer à la saisie */
export function sectionNames(urls: MosaicUrl[]): string[] {
  return buildSections(urls)
    .map((section) => section.name)
    .filter((name) => !!name);
}

/** Sites épinglés : ceux de la racine, puis ceux de chaque catégorie, dans l'ordre d'affichage */
export function collectPins(categories: MosaicCategory[], rootUrls: MosaicUrl[]): MosaicPin[] {
  const byOrder = (a: MosaicUrl, b: MosaicUrl) => a.order - b.order;
  const rootPins = [...rootUrls].sort(byOrder).map((url) => ({ url, categoryName: null }));
  const categoryPins = [...categories].sort((a, b) => a.order - b.order).flatMap((category) => [...category.urls].sort(byOrder).map((url) => ({ url, categoryName: category.name })));
  return [...rootPins, ...categoryPins].filter((pin) => pin.url.pinned);
}
