import { Scenario } from '../../core/scenarios/scenario.models';

export interface MosaicUrl {
  id: string;
  url: string;
  title: string;
  order: number;
  /** Scénario Spy & Replay joué automatiquement après l'ouverture du site */
  scenarioId?: string;
}

export interface MosaicCategory {
  id: string;
  name: string;
  order: number;
  urls: MosaicUrl[];
}

export interface MosaicConfig {
  version: number;
  categories: MosaicCategory[];
  urls: MosaicUrl[];
  openOnStartup: boolean;
}

/**
 * Contenu d'un fichier d'export : la configuration, plus les scénarios qu'elle
 * référence. Sans eux, un import sur un autre poste laisserait des associations
 * pointant dans le vide.
 */
export interface MosaicExport extends MosaicConfig {
  scenarios?: Scenario[];
}

/** Résultat d'un import, pour le message de confirmation */
export interface MosaicImportResult {
  importedScenarios: number;
  droppedReferences: number;
}

export const MOSAIC_CONFIG_KEY = 'mosaicConfig';
export const MOSAIC_SCREENSHOT_PREFIX = 'mosaic_screenshot_';
