import sharp from 'sharp';
import { join } from 'node:path';
import { tempDir } from './tmp.js';

const noise = (width, height) => sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } });
const flat = (width, height, background) => sharp({ create: { width, height, channels: 3, background } });
const inTemp = async (name) => join(await tempDir('src'), name);

/** Creates a noisy RGB TIFF of the given size (noise keeps JPEG tiles non-trivial). */
export async function makeImage(width, height) {
  const out = await inTemp(`test-${width}x${height}.tif`);
  await noise(width, height).tiff().toFile(out);
  return out;
}

// Sources that need normalising: 16-bit RGB, CMYK, greyscale, and half-transparent RGBA.
const variants = {
  rgb16: ['png', (image) => image.toColourspace('rgb16')],
  cmyk: ['tif', (image) => image.toColourspace('cmyk')],
  grey: ['tif', (image) => image.toColourspace('b-w')],
  rgba: ['png', (image) => image.ensureAlpha(0.5)],
  // Formats the web uses: WebP, AVIF, and GIF (a palette of 256 colours).
  webp: ['webp', (image) => image.webp()],
  avif: ['avif', (image) => image.avif()],
  gif: ['gif', (image) => image.gif()],
};

export async function makeVariant(kind, width = 700, height = 500) {
  const [extension, convert] = variants[kind];
  const out = await inTemp(`test-${kind}.${extension}`);
  await convert(noise(width, height)).toFile(out);
  return out;
}

/**
 * A 600x400 JPEG, black with a white block in its stored top-left corner, tagged with an
 * EXIF orientation (1-8) the way cameras and phones do instead of rotating the pixels.
 */
export async function makeOriented(orientation) {
  const out = await inTemp(`oriented-${orientation}.jpg`);
  const block = await flat(100, 100, '#ffffff').png().toBuffer();
  await flat(600, 400, '#000000').composite([{ input: block, left: 0, top: 0 }]).withMetadata({ orientation }).jpeg().toFile(out);
  return out;
}

/**
 * A flat image of the sRGB colour 200,60,40 stored in Display P3 with that profile embedded,
 * as wide-gamut cameras and phones write. The stored numbers are therefore not 200,60,40.
 */
export async function makeWideGamut() {
  const out = await inTemp('display-p3.tif');
  await flat(700, 500, { r: 200, g: 60, b: 40 }).withIccProfile('p3').tiff().toFile(out);
  return out;
}

/** A photo as a camera writes it: EXIF naming the camera and where it was taken. */
export async function makeGeotagged() {
  const out = await inTemp('geotagged.jpg');
  const exif = {
    IFD0: { Make: 'TestCam', Model: 'Serial 12345' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '54/1 13/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '1/1 20/1 0/1' },
  };
  await noise(700, 500).withExif(exif).jpeg().toFile(out);
  return out;
}

/**
 * A photo straight off a phone: 1600x1200 as stored but tagged to be shown turned on its side (so 1200x1600),
 * in Display P3, with EXIF naming the camera and where it was taken.
 */
export async function makePhonePhoto() {
  const out = await inTemp('phone.jpg');
  const exif = {
    IFD0: { Make: 'TestPhone', Model: 'Serial 12345' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '54/1 13/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '1/1 20/1 0/1' },
  };
  await noise(1600, 1200).withIccProfile('p3').withExif(exif).withMetadata({ orientation: 6 }).jpeg().toFile(out);
  return out;
}

/**
 * A square PNG of one 256-pixel patch of noise, repeated. It is small to store (about 22 MB at 21,504 pixels) but
 * costly as JPEG tiles (about 1.8 bytes a pixel at quality 100), so a big one tests the GitHub Pages size limit
 * without a huge upload. The noise is seeded, so the same size always gives the same file.
 */
export async function makeRepeatedNoise(side) {
  const out = await inTemp(`repeated-noise-${side}.png`);
  let seed = 1;
  const patch = Buffer.alloc(256 * 256 * 3).map(() => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  const tile = await sharp(patch, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  await sharp({ create: { width: side, height: side, channels: 3, background: '#808080' }, limitInputPixels: false })
    .composite([{ input: tile, tile: true }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

/** What a file is: its size, channels, colour space, bit depth, and any orientation tag or EXIF it carries. */
export async function inspect(file) {
  const { width, height, channels, space, depth, orientation = 1, exif } = await sharp(file).metadata();
  return { width, height, channels, space, depth, orientation, exif: Boolean(exif) };
}

/** The sRGB colour a colour-managed browser shows at x,y: an embedded profile is applied, none means sRGB. */
export async function pixel(file, x, y) {
  const data = await sharp(file).extract({ left: x, top: y, width: 1, height: 1 }).toColourspace('srgb').raw().toBuffer();
  return [...data.subarray(0, 3)];
}
