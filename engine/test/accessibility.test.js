// What the README promises about accessibility is what accessibility.e2e.js holds every page to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repo } from './support/harness.js';

const read = (path) => readFile(join(repo, path), 'utf8');

test('every page is checked against WCAG 2.2 AA, the current version, as the README and docs/DEVELOPING.md say', async () => {
  // axe's WCAG 2.2 rule (target-size, 2.5.8) is tagged wcag22aa alone, and runs only when asked for.
  assert.match(await read('engine/test/e2e/accessibility.e2e.js'), /withTags\(\['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'\]\)/);
  assert.match(await read('README.md'), /checked automatically against the WCAG 2\.2 AA guidelines/);
  assert.match(await read('docs/DEVELOPING.md'), /against WCAG 2\.2 AA with axe/);
});
