import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// OpenSeadragon looks up its button images by fixed file name under `prefixUrl`, so they
// cannot go through Vite's hashed asset pipeline. Emit them verbatim under osd-images/.
function openSeadragonImages(): Plugin {
  const dir = fileURLToPath(new URL('../../node_modules/openseadragon/build/openseadragon/images', import.meta.url));
  return {
    name: 'openseadragon-images',
    generateBundle() {
      for (const name of readdirSync(dir)) {
        this.emitFile({ type: 'asset', fileName: `osd-images/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './', // relative, so the site works at user.github.io/repo/ and at a custom domain
  plugins: [react(), openSeadragonImages()],
  build: {
    outDir: fileURLToPath(new URL('../../dist', import.meta.url)),
    emptyOutDir: true, // `npm run build` makes the page first, then engine/build.js adds the image to it
    chunkSizeWarningLimit: 4000, // Mirador is large but only loaded when chosen
  },
});
