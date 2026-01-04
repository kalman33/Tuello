import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tuello.dev',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
