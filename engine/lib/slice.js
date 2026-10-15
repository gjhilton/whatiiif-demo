import sharp from 'sharp';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { imageInfo, missingFiles } from './service.js';

const anySize = { limitInputPixels: false }; // sharp refuses images over 268 megapixels unless told otherwise

/** How big `source` is as it will be published: upright, as its camera meant it. Reads only the file's header. */
export async function pictureSize(source) {
  const { autoOrient } = await sharp(source, anySize).metadata();
  return { width: autoOrient.width, height: autoOrient.height };
}

/**
 * Slices `source` into a static IIIF Image API 3.0 level 0 service in `outDir` (empty, or not there yet), and
 * returns its info.json. Every published image is upright, opaque, 8-bit sRGB, and carries none of the source's
 * metadata.
 */
export async function slice({ source, outDir, id, tileSize = 512, quality = 85, publishFull = true }) {
  const work = await mkdtemp(join(tmpdir(), 'whatiiif-'));
  try {
    // Decode the source once, into libvips' uncompressed format, which every later pass reads straight from disk.
    // `rotate()` applies the rotation a camera only recorded as a tag; an embedded colour profile is used to
    // convert to sRGB; EXIF (camera, GPS) is dropped, as sharp does unless asked to keep it.
    const pixels = join(work, 'pixels.v');
    await sharp(source, anySize).rotate().flatten({ background: '#ffffff' }).toColourspace('srgb').toFile(pixels);
    const published = (jpeg = {}) => sharp(pixels, anySize).jpeg({ quality, ...jpeg });

    await published().tile({ layout: 'iiif3', size: tileSize, overlap: 0 }).toFile(outDir);

    // libvips writes an info.json too; all we keep from it is the size it measured.
    const { width, height } = JSON.parse(await readFile(join(outDir, 'info.json'), 'utf8'));
    const info = imageInfo({ id, width, height, tileSize });
    await writeFile(join(outDir, 'info.json'), JSON.stringify(info, null, 2));

    // Tiling leaves out the whole-image files: the listed sizes, the level that fits one tile, and full/max.
    const wanted = new Set(await missingFiles(outDir));
    if (publishFull) wanted.add('full/max/0/default.jpg');

    for (const path of wanted) {
      const [region, size] = path.split('/');
      if (region !== 'full') throw new Error(`The slicer did not write a tile that viewers will ask for: ${path}`);
      const [w, h] = size.split(',').map(Number);
      await mkdir(dirname(join(outDir, path)), { recursive: true });
      // Optimised Huffman coding makes the encoder hold a whole image in memory (about 600 MB at 100 megapixels),
      // which is fine for tiles and small renditions but not for the one full-size file.
      const image = size === 'max' ? published({ optimiseCoding: false }) : published().resize(w, h, { fit: 'fill' });
      await image.toFile(join(outDir, path));
    }
    return info;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
