// Saving the view on screen as a picture. A static image service has no server to cut one, so the page assembles it
// from the published tiles, at the sharpest level that keeps it within `maxSide` pixels a side.
import type { Region } from './address';

interface Info {
  width: number;
  height: number;
  tiles: { width: number; height?: number; scaleFactors: number[] }[];
}

/** Where each tile, by its path in the image service, goes in a saved picture `width` by `height` pixels. */
export interface Plan {
  scale: number;
  width: number;
  height: number;
  tiles: { path: string; x: number; y: number; w: number; h: number }[];
}

/**
 * The tiles that make `region` of the picture (all of it, if none), at the sharpest level no more than `maxSide`
 * pixels a side. Their paths are those a viewer asks for (see engine/lib/service.js), so every one is published.
 */
export function tilesFor(info: Info, region?: Region, maxSide = 4096): Plan {
  const { width: W, height: H } = info;
  const part = region ?? { x: 0, y: 0, w: W, h: H };
  const { width: tw, height: th = tw, scaleFactors } = info.tiles[0];
  const ascending = [...scaleFactors].sort((a, b) => a - b);
  const scale = ascending.find((s) => Math.max(part.w, part.h) / s <= maxSide) ?? ascending.at(-1)!;
  const [levelW, levelH] = [Math.ceil(W / scale), Math.ceil(H / scale)];
  const [originX, originY] = [Math.floor(part.x / scale), Math.floor(part.y / scale)];
  const plan = { scale, width: Math.ceil(part.w / scale), height: Math.ceil(part.h / scale), tiles: [] as Plan['tiles'] };

  // A level that fits in one tile is published as a whole-image file.
  if (levelW < tw && levelH < th) {
    const size = levelW === W && levelH === H ? 'max' : `${levelW},${levelH}`;
    plan.tiles.push({ path: `full/${size}/0/default.jpg`, x: -originX, y: -originY, w: levelW, h: levelH });
    return plan;
  }
  const span = (from: number, length: number, tile: number) => [Math.floor(from / (tile * scale)), Math.floor((from + length - 1) / (tile * scale))];
  const [firstX, lastX] = span(part.x, part.w, tw);
  const [firstY, lastY] = span(part.y, part.h, th);
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      const [regionX, regionY] = [x * tw * scale, y * th * scale];
      const [regionW, regionH] = [Math.min(tw * scale, W - regionX), Math.min(th * scale, H - regionY)];
      const whole = regionX === 0 && regionY === 0 && regionW === W && regionH === H;
      const [sizeW, sizeH] = [Math.min(tw, levelW - x * tw), Math.min(th, levelH - y * th)];
      const size = sizeW === W && sizeH === H ? 'max' : `${sizeW},${sizeH}`;
      const path = `${whole ? 'full' : `${regionX},${regionY},${regionW},${regionH}`}/${size}/0/default.jpg`;
      plan.tiles.push({ path, x: x * tw - originX, y: y * th - originY, w: sizeW, h: sizeH });
    }
  }
  return plan;
}

const picture = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${url} could not be loaded`));
    image.src = url;
  });

/** Downloads `region` of the picture (all of it, if none) as a JPEG named after `title` and the region. */
export async function saveView(infoUrl: string, title: string, region?: Region): Promise<void> {
  const info: Info = await (await fetch(infoUrl)).json();
  const plan = tilesFor(info, region);
  const service = infoUrl.replace(/\/info\.json$/, '');
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [plan.width, plan.height];
  const context = canvas.getContext('2d')!;
  const tiles = await Promise.all(plan.tiles.map(async (tile) => ({ ...tile, image: await picture(`${service}/${tile.path}`) })));
  for (const { image, x, y, w, h } of tiles) context.drawImage(image, x, y, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('the picture could not be made');

  const part = region ?? { x: 0, y: 0, w: info.width, h: info.height };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '-')} ${part.x},${part.y},${part.w},${part.h}.jpg`;
  document.body.append(link); // older Firefox downloads only from a link that is in the page
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
