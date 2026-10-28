import { MOSAIC_CONFIG_KEY, MOSAIC_SCREENSHOT_PREFIX, MOSAIC_TREE_EXPANDED_KEY, MOSAIC_VIEW_MODE_KEY } from '../../mosaic/models/mosaic.models';
import { SCENARIOS_KEY } from '../../core/scenarios/scenario.models';

export type StorageCategoryId = 'config' | 'mocks' | 'scenarios' | 'mosaic' | 'tracks' | 'search' | 'other';

export interface StorageCategory {
  id: StorageCategoryId;
  icon: string;
  /** Clés exactes de chrome.storage.local appartenant à la catégorie */
  keys: string[];
  /** Préfixes de clés (ex : captures de la mosaïque, une clé par URL) */
  prefixes?: string[];
  /** Cochée par défaut dans la boîte de dialogue */
  checkedByDefault: boolean;
}

/**
 * Répartition des clés de chrome.storage.local par fonctionnalité, pour l'export / import sélectif.
 * Toute clé non référencée tombe dans 'other' (états transitoires : enregistrement en cours, lecture, onglet actif...).
 */
export const STORAGE_CATEGORIES: StorageCategory[] = [
  {
    id: 'config',
    icon: 'settings_applications',
    keys: [
      'language',
      'messages',
      'darkMode',
      'deepMockLevel',
      'mouseCoordinates',
      'verboseMode',
      'fastReplay',
      'playwrightLocalHosts',
      'settings',
      'selectedMenu',
      'tuelloKeyboardShortcut',
      'tuelloDockedLeft',
      'tuelloTagsPosition',
      'tuelloGuideTourState'
    ],
    checkedByDefault: true
  },
  {
    id: 'mocks',
    icon: 'dns',
    keys: ['tuelloRecords', 'tuelloMockProfiles', 'tuelloActiveProfileId', 'tuelloHTTPTags', 'tuelloHTTPFilter', 'tuelloHTTPOverWrite'],
    checkedByDefault: true
  },
  {
    id: 'scenarios',
    icon: 'videocam',
    keys: ['uiRecord', SCENARIOS_KEY, 'uiRecordDeleted', 'reportUserHistory'],
    checkedByDefault: true
  },
  {
    id: 'mosaic',
    icon: 'grid_view',
    keys: [MOSAIC_CONFIG_KEY, MOSAIC_VIEW_MODE_KEY, MOSAIC_TREE_EXPANDED_KEY],
    prefixes: [MOSAIC_SCREENSHOT_PREFIX],
    checkedByDefault: true
  },
  {
    id: 'tracks',
    icon: 'track_changes',
    keys: ['tuelloTracks', 'tuelloTracksBody', 'tuelloTrackData', 'tuelloTrackDataDisplay', 'tuelloTrackDataDisplayType'],
    checkedByDefault: true
  },
  {
    id: 'search',
    icon: 'search',
    keys: ['tuelloElements', 'searchAttributeDisplay', 'searchElementType', 'searchElementDisplayMode', 'searchElementsHideCount'],
    checkedByDefault: true
  },
  {
    id: 'other',
    icon: 'more_horiz',
    keys: [],
    checkedByDefault: false
  }
];

export function getStorageCategoryId(key: string): StorageCategoryId {
  const category = STORAGE_CATEGORIES.find((c) => c.keys.includes(key) || c.prefixes?.some((prefix) => key.startsWith(prefix)));
  return category ? category.id : 'other';
}

/**
 * Regroupe les clés d'un contenu de stockage par catégorie.
 */
export function groupStorageKeys(data: Record<string, unknown>): Map<StorageCategoryId, string[]> {
  const groups = new Map<StorageCategoryId, string[]>();
  Object.keys(data).forEach((key) => {
    const id = getStorageCategoryId(key);
    groups.set(id, [...(groups.get(id) ?? []), key]);
  });
  return groups;
}

/**
 * Ne conserve que les clés des catégories sélectionnées.
 */
export function filterStorageByCategories(data: Record<string, unknown>, categories: StorageCategoryId[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => categories.includes(getStorageCategoryId(key))));
}
