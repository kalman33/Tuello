import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { buildSections, collectPins, flattenSections, sectionNames } from './mosaic-sections';

const site = (id: string, order: number, extra: Partial<MosaicUrl> = {}): MosaicUrl => ({ id, url: `https://${id}.test`, title: id, order, ...extra });
const ids = (urls: MosaicUrl[]) => urls.map((url) => url.id);

describe('mosaic-sections', () => {
  describe('buildSections', () => {
    it('garde une seule section sans nom quand aucun site n’a de section', () => {
      const sections = buildSections([site('a', 0), site('b', 1)]);
      expect(sections.map((s) => s.name)).toEqual(['']);
      expect(ids(sections[0].urls)).toEqual(['a', 'b']);
    });

    it('place les sites sans section en tête, puis les sections par ordre d’apparition', () => {
      const sections = buildSections([site('a', 0, { group: 'Rec2' }), site('b', 1), site('c', 2, { group: 'Rec1' }), site('d', 3, { group: 'Rec2' })]);
      expect(sections.map((s) => s.name)).toEqual(['', 'Rec2', 'Rec1']);
      expect(ids(sections[1].urls)).toEqual(['a', 'd']);
    });

    it('traite un nom composé d’espaces comme une absence de section', () => {
      expect(buildSections([site('a', 0, { group: '  ' })]).map((s) => s.name)).toEqual(['']);
    });
  });

  describe('flattenSections', () => {
    it('affecte à chaque site la section où il se trouve et retire celle des sites sans section', () => {
      const flat = flattenSections([
        { name: '', urls: [site('a', 0, { group: 'Ancienne' })] },
        { name: 'Rec1', urls: [site('b', 1)] }
      ]);
      expect(flat.map((url) => url.group)).toEqual([undefined, 'Rec1']);
    });

    it('produit une liste que buildSections regroupe à l’identique', () => {
      const urls = [site('a', 0), site('b', 1, { group: 'Rec2' }), site('c', 2, { group: 'Rec1' })];
      const sections = buildSections(urls);
      expect(buildSections(flattenSections(sections)).map((s) => s.name)).toEqual(sections.map((s) => s.name));
    });
  });

  it('sectionNames ignore les sites sans section', () => {
    expect(sectionNames([site('a', 0), site('b', 1, { group: 'Rec1' })])).toEqual(['Rec1']);
  });

  describe('collectPins', () => {
    it('liste la racine puis les catégories, triées, sans les sites non épinglés', () => {
      const categories: MosaicCategory[] = [
        { id: 'c2', name: 'Deux', order: 1, urls: [site('d', 0, { pinned: true })] },
        { id: 'c1', name: 'Un', order: 0, urls: [site('c', 1, { pinned: true }), site('b', 0, { pinned: true }), site('x', 2)] }
      ];
      const pins = collectPins(categories, [site('a', 0, { pinned: true }), site('y', 1)]);
      expect(pins.map((pin) => pin.url.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(pins.map((pin) => pin.categoryName)).toEqual([null, 'Un', 'Un', 'Deux']);
    });
  });
});
