// The picture in content/. Nothing here may need an npm package: the Deploy workflow's first job runs
// engine/ci/has-image.js, which uses this, before it installs any.
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

// The formats the slicer reads, with the media type the manifest gives the original file.
const FORMATS = { '.tif': 'image/tiff', '.tiff': 'image/tiff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
// Pictures in other formats, named in the error so their owner knows to convert them.
const UNSUPPORTED = ['.jp2', '.j2k', '.heic', '.heif', '.webp', '.gif', '.bmp', '.avif', '.psd'];

const kind = (file) => extname(file).toLowerCase();

/** The picture files in `dir`: those the slicer reads, and those in formats it cannot read yet. */
export async function listImages(dir) {
  const files = (await readdir(dir)).sort();
  return {
    images: files.filter((file) => kind(file) in FORMATS),
    unsupported: files.filter((file) => UNSUPPORTED.includes(kind(file))),
  };
}

/** The one picture in `dir`, or an error saying what to do about it. */
export async function findImage(dir) {
  const { images, unsupported } = await listImages(dir);
  if (images.length === 0 && unsupported.length > 0) {
    throw new Error(`${unsupported.join(', ')} is not supported yet. Convert it to TIFF, PNG or JPEG and commit that in content/ instead.`);
  }
  if (images.length === 0) {
    throw new Error('No image found in content/. Commit exactly one TIFF, PNG or JPEG (tif, png, jpg) there.');
  }
  if (images.length > 1) {
    throw new Error(`content/ must contain exactly one image, but found ${images.length}: ${images.join(', ')}. Remove the extras.`);
  }
  return { path: join(dir, images[0]), name: images[0], format: FORMATS[kind(images[0])] };
}
