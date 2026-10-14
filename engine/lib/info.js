const MAX_SIZE_WIDTH = 2000;

/**
 * The info.json of a static IIIF Image API 3.0 level 0 service: the contract between the slicer,
 * which must write every file it implies, and viewers, which request only what it describes.
 */
export function imageInfo({ id, width, height, tileSize }) {
  // Halve until the whole image fits in one tile.
  const scaleFactors = [1];
  while (Math.max(width, height) / scaleFactors.at(-1) > tileSize) scaleFactors.push(scaleFactors.at(-1) * 2);

  // Whole-image renditions for thumbnails and previews. Viewers built on OpenSeadragon 4-5 read `sizes` as the
  // pyramid levels, so only real levels may be listed: the smaller ones here, deep zoom covers the rest.
  const sizes = scaleFactors
    .filter((s) => s > 1)
    .map((s) => ({ width: Math.ceil(width / s), height: Math.ceil(height / s) }))
    .filter((size) => size.width <= MAX_SIZE_WIDTH)
    .reverse();

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
