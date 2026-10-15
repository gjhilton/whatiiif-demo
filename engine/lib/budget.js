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

/**
 * Keeps the site under the Pages limit by dropping full/max if it must. Says whether the rest fits, and how many
 * bytes it takes either way.
 */
export async function applyBudget({ dir, info, budgetBytes = PAGES_BUDGET_BYTES }) {
  let bytes = await dirSize(dir);
  if (bytes <= budgetBytes) return { fits: true, bytes, droppedFull: false };

  const maxIsNeeded = expectedRequests(info).includes('full/max/0/default.jpg');
  if (maxIsNeeded) return { fits: false, bytes, droppedFull: false };
  await rm(join(dir, 'full/max'), { recursive: true, force: true });
  bytes = await dirSize(dir);
  return { fits: bytes <= budgetBytes, bytes, droppedFull: true };
}
