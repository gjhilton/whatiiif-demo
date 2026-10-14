// The picture in content/. Nothing here may need an npm package: the Deploy workflow's first job runs
// engine/ci/has-image.js, which uses this, before it installs any.
import { open, readdir, stat } from 'node:fs/promises';
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
  const path = join(dir, images[0]);
  return { path, name: images[0], format: FORMATS[kind(images[0])], bytes: (await stat(path)).size };
}

// How each kind of file begins: [what it is, its media type if the slicer reads it, its first bytes].
const SIGNATURES = [
  ['TIFF', 'image/tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['TIFF', 'image/tiff', [0x4d, 0x4d, 0x00, 0x2a]],
  ['TIFF', 'image/tiff', [0x49, 0x49, 0x2b, 0x00]], // BigTIFF, for files over 4 GB
  ['TIFF', 'image/tiff', [0x4d, 0x4d, 0x00, 0x2b]],
  ['PNG', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['JPEG', 'image/jpeg', [0xff, 0xd8, 0xff]],
  ['GIF', undefined, [...'GIF8'].map((c) => c.charCodeAt(0))],
  ['JPEG 2000', undefined, [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20]],
  ['JPEG 2000', undefined, [0xff, 0x4f, 0xff, 0x51]],
  ['BMP', undefined, [0x42, 0x4d]],
  ['Photoshop file', undefined, [...'8BPS'].map((c) => c.charCodeAt(0))],
];

/**
 * What a file holds, judged by its first bytes: `{ name, format }` for a picture (`format` only for one the slicer
 * reads), `{ page: true }` for a web page, `{}` for anything else.
 */
export async function sniff(path) {
  const file = await open(path);
  const head = await file.read(Buffer.alloc(64), 0, 64, 0).then(({ buffer, bytesRead }) => buffer.subarray(0, bytesRead)).finally(() => file.close());
  const starts = (bytes, at = 0) => bytes.every((byte, i) => head[at + i] === byte);
  for (const [name, format, bytes] of SIGNATURES) if (starts(bytes)) return { name, format };
  const ascii = head.toString('latin1');
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return { name: 'WebP' };
  if (ascii.slice(4, 8) === 'ftyp') return { name: /^(avif|avis)/.test(ascii.slice(8, 12)) ? 'AVIF' : 'HEIC' };
  if (/^(\xEF\xBB\xBF)?\s*</.test(ascii)) return { page: true }; // read as latin1, a UTF-8 byte order mark is three characters
  return {};
}
