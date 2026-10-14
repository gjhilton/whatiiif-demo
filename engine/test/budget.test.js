import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { slice } from '../lib/slice.js';
import { applyBudget, dirSize } from '../lib/budget.js';
import { makeImage } from './support/fixtures.js';
import { tempDir } from './support/tmp.js';

const exists = (p) => access(p).then(() => true, () => false);

async function sliced() {
  const out = await tempDir('out');
  return { out, info: await slice({ source: await makeImage(2000, 1500), outDir: out, id: 'https://example.org/i' }) };
}

test('keeps everything when the site fits the budget', async () => {
  const { out, info } = await sliced();
  const result = await applyBudget({ dir: out, info, budgetBytes: (await dirSize(out)) + 1 });
  assert.equal(result.droppedFull, false);
  assert.ok(await exists(join(out, 'full/max/0/default.jpg')));
});

test('drops full/max first when over budget', async () => {
  const { out, info } = await sliced();
  const before = await dirSize(out);
  const result = await applyBudget({ dir: out, info, budgetBytes: before - 1 });
  assert.equal(result.droppedFull, true);
  assert.equal(await exists(join(out, 'full/max/0/default.jpg')), false);
  assert.ok(result.bytes < before);
});

test('fails with sizes in plain English when the tiles alone do not fit', async () => {
  const { out, info } = await sliced();
  await assert.rejects(applyBudget({ dir: out, info, budgetBytes: 1 }), /too large.*GitHub Pages/is);
});
