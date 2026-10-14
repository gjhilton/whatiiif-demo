import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const SUPPORTED = ['.tif', '.tiff', '.png', '.jpg', '.jpeg'];
const UNSUPPORTED_IMAGES = ['.jp2', '.j2k', '.heic', '.heif', '.webp', '.gif', '.bmp', '.avif', '.psd'];

/** The image files in the content directory: those we can slice, and those in formats we cannot read yet. */
export async function listImages(dir) {
  const files = (await readdir(dir)).sort();
  return {
    images: files.filter((f) => SUPPORTED.includes(extname(f).toLowerCase())),
    unsupported: files.filter((f) => UNSUPPORTED_IMAGES.includes(extname(f).toLowerCase())),
  };
}

/** Finds the one source image in the content directory, or throws with what to do about it. */
export async function findSourceImage(dir) {
  const { images, unsupported } = await listImages(dir);

  if (images.length === 0 && unsupported.length > 0) {
    throw new Error(
      `${unsupported.join(', ')} is not supported yet. Convert it to TIFF, PNG or JPEG and commit that in content/ instead.`,
    );
  }
  if (images.length === 0) {
    throw new Error('No image found in content/. Commit exactly one TIFF, PNG or JPEG (tif, png, jpg) there.');
  }
  if (images.length > 1) {
    throw new Error(`content/ must contain exactly one image, but found ${images.length}: ${images.join(', ')}. Remove the extras.`);
  }
  return join(dir, images[0]);
}
