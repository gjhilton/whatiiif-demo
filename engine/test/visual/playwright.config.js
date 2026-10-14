// Visual tests: the page in each state a visitor can meet, compared with reviewed screenshots in ./screenshots.
//
//   npm run test:visual                         compare
//   npm run test:visual -- --update-snapshots   after a deliberate change; look at every new picture before committing
//
// Fonts differ between operating systems, so each has its own screenshots; CI compares the Linux ones.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.visual.js',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{platform}{ext}',
  outputDir: '../../../test-results/visual',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.002 } },
  use: { browserName: 'chromium' },
});
