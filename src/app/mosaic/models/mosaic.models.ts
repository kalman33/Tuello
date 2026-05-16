export interface MosaicUrl {
  id: string;
  url: string;
  title: string;
  order: number;
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

export const MOSAIC_CONFIG_KEY = 'mosaicConfig';
export const MOSAIC_SCREENSHOT_PREFIX = 'mosaic_screenshot_';
