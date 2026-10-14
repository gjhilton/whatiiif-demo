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
 * Every tile request path (relative to the image id) that a viewer will make
 * for an Image API 3.0 info.json. Mirrors OpenSeadragon's IIIF tile source,
 * which Mirador and most other viewers build on, so a static level 0 service
 * is only "done" when every path here exists on disk.
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
