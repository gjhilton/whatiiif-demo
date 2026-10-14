import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expectedRequests } from './service.js';

export const PAGES_BUDGET_BYTES = 900 * 1024 * 1024; // GitHub Pages sites are capped at 1 GB

export async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(path) : (await stat(path)).size;
  }
  return total;
}

const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** Keeps the site under the Pages limit by dropping full/max first; throws if the tiles alone do not fit. */
export async function applyBudget({ dir, info, budgetBytes = PAGES_BUDGET_BYTES }) {
  let bytes = await dirSize(dir);
  if (bytes <= budgetBytes) return { bytes, droppedFull: false };

  const maxIsNeeded = expectedRequests(info).includes('full/max/0/default.jpg');
  if (!maxIsNeeded) {
    await rm(join(dir, 'full/max'), { recursive: true, force: true });
    bytes = await dirSize(dir);
    if (bytes <= budgetBytes) return { bytes, droppedFull: true };
  }
  throw new Error(
    `The image tiles are too large for GitHub Pages: ${mb(bytes)} against a ${mb(budgetBytes)} budget. ` +
      'Lower tiles.quality in content/whatiiif.toml or use a smaller source image.',
  );
}
