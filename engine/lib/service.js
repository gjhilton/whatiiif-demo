// The static IIIF Image API 3.0 level 0 service: its info.json, every file a viewer reading that info.json will ask
// for, and which of those a folder is missing. A static service has no server to make a file on request, so it
// works only if the slicer wrote everything the info.json implies.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_SIZE = 2000; // the longest side of a whole-image rendition

/** The info.json of an image `width` by `height` pixels, cut into square tiles `tileSize` pixels across. */
export function imageInfo({ id, width, height, tileSize }) {
  // Halve until the whole image fits in one tile.
  const scaleFactors = [1];
  while (Math.max(width, height) / scaleFactors.at(-1) > tileSize) scaleFactors.push(scaleFactors.at(-1) * 2);

  // Whole-image renditions for thumbnails and previews. Viewers built on OpenSeadragon 4-5 read `sizes` as the
  // pyramid levels, so only real levels may be listed: the smaller ones here, deep zoom covers the rest. The
  // smallest level is always listed, however long, so that a picture cut into tiles bigger than MAX_SIZE still has a
  // whole-picture file other than full/max, which its owner may choose not to publish.
  const levels = scaleFactors
    .filter((s) => s > 1)
    .map((s) => ({ width: Math.ceil(width / s), height: Math.ceil(height / s) }))
    .reverse();
  const sizes = levels.filter((size, i) => i === 0 || Math.max(size.width, size.height) <= MAX_SIZE);

  return {
    '@context': 'http://iiif.io/api/image/3/context.json',
    id,
    type: 'ImageService3',
    protocol: 'http://iiif.io/api/image',
    profile: 'level0',
    width,
    height,
    extraFeatures: ['sizeByWh'], // without this OpenSeadragon will not request tiles from a level 0 service
    tiles: [{ width: tileSize, scaleFactors }],
    sizes,
  };
}

/**
 * OpenSeadragon 4 and 5 (so Mirador 3-4 and Universal Viewer) take `sizes` to be the pyramid levels whenever
 * the list is as long as the pyramid is deep, without checking, and size their tile requests from it.
 * Returns the level size they would use for each scale factor; empty when the lengths rule that reading out.
 */
function sizesReadAsLevels(info, scaleFactors) {
  if (!info.sizes) return new Map();
  const maxLevel = Math.round(Math.log2(Math.max(...scaleFactors)));
  const levels = [...info.sizes].sort((a, b) => a.width - b.width);
  if (levels.length === maxLevel) levels.push({ width: info.width, height: info.height });
  if (levels.length !== maxLevel + 1) return new Map();
  return new Map(scaleFactors.map((s) => [s, levels[maxLevel - Math.round(Math.log2(s))]]));
}

/**
 * Every path, relative to the service, that a viewer will request for this info.json. Mirrors OpenSeadragon's
 * IIIF tile source, which Mirador and most other viewers build on.
 */
export function expectedRequests(info) {
  const { width: W, height: H } = info;
  const paths = new Set();

  for (const { width, height } of info.sizes ?? []) {
    paths.add(`full/${width},${height}/0/default.jpg`);
  }

  for (const { width: tw, height: th = tw, scaleFactors } of info.tiles) {
    const listed = sizesReadAsLevels(info, scaleFactors);
    for (const s of scaleFactors) {
      const computed = { width: Math.ceil(W / s), height: Math.ceil(H / s) };

      for (const { width: levelW, height: levelH } of [computed, listed.get(s)].filter(Boolean)) {
        if (levelW < tw && levelH < th) {
          const size = levelW === W && levelH === H ? 'max' : `${levelW},${levelH}`;
          paths.add(`full/${size}/0/default.jpg`);
          continue;
        }

        for (let y = 0; y * th < levelH; y++) {
          for (let x = 0; x * tw < levelW; x++) {
            const regionX = x * tw * s;
            const regionY = y * th * s;
            const regionW = Math.min(tw * s, W - regionX);
            const regionH = Math.min(th * s, H - regionY);
            const covers = regionX === 0 && regionY === 0 && regionW === W && regionH === H;
            const region = covers ? 'full' : `${regionX},${regionY},${regionW},${regionH}`;

            const sizeW = Math.min(tw, levelW - x * tw);
            const sizeH = Math.min(th, levelH - y * th);
            const size = sizeW === W && sizeH === H ? 'max' : `${sizeW},${sizeH}`;
            paths.add(`${region}/${size}/0/default.jpg`);
          }
        }
      }
    }
  }
  return [...paths];
}

/** The files a viewer would ask for that are not in the service folder `dir`, as described by its info.json. */
export async function missingFiles(dir) {
  const info = JSON.parse(await readFile(join(dir, 'info.json'), 'utf8'));
  const missing = [];
  for (const path of expectedRequests(info)) {
    if (!(await access(join(dir, path)).then(() => true, () => false))) missing.push(path);
  }
  return missing;
}
