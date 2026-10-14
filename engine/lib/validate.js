import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { expectedRequests } from './requests.js';

/** Tile request paths a viewer would make that are not on disk. */
export async function findMissingTiles(dir, info) {
  const missing = [];
  for (const path of expectedRequests(info)) {
    try {
      await access(join(dir, path));
    } catch {
      missing.push(path);
    }
  }
  return missing;
}

/** Returns a list of plain-English problems; empty means the service is servable. */
export async function validate(dir) {
  const info = JSON.parse(await readFile(join(dir, 'info.json'), 'utf8'));
  const problems = [];

  if (info.profile === 'level0' && !info.extraFeatures?.includes('sizeByWh')) {
    problems.push(
      'info.json is level0 but does not list "sizeByWh" in extraFeatures, so viewers such as OpenSeadragon will not request tiles from it',
    );
  }

  for (const path of await findMissingTiles(dir, info)) {
    problems.push(`missing tile: ${path}`);
  }
  return problems;
}
