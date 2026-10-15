// The picture in the notes helper: OpenSeadragon, with the part of the picture each note is about outlined and
// numbered, and a way to mark a part by dragging across it.
import OpenSeadragon from 'openseadragon';
import type { Site } from '../site';
import type { Region } from '../address';
import { pageColour } from '../colours';

export interface Picture {
  /** The part of the picture on screen, in whole pixels within it. */
  inView(): Region | undefined;
  /** Moves the view to `region`, now or once the picture is open. */
  show(region: Region): void;
  /** Outlines each note's part, numbered, the `selected` one more boldly. */
  mark(regions: (Region | undefined)[], selected: number | undefined): void;
  /** Lets the next drag across the picture mark a part, rather than move the picture; `onDrawn` is told which. */
  draw(onDrawn: (region: Region) => void): void;
  stopDrawing(): void;
  /** Shows the whole picture. */
  home(): void;
  destroy(): void;
}

/** Opens the picture of `site` in `el`; `onChoose` is told which note's number the owner pressed. */
export function openPicture(el: HTMLElement, site: Site, onChoose: (index: number) => void): Picture {
  const viewer = OpenSeadragon({
    element: el,
    tileSources: site.infoUrl,
    showNavigationControl: false, // zoomed with the mouse wheel, a pinch, or the keyboard (+ and -)
    showNavigator: true,
    navigatorPosition: 'BOTTOM_RIGHT',
    navigatorBackground: pageColour('--viewer'),
    navigatorBorderColor: pageColour('--ink'),
    navigatorDisplayRegionColor: pageColour('--ink'),
    gestureSettingsMouse: { clickToZoom: false },
  });
  const image = () => viewer.world.getItemAt(0);
  let opened = false;
  let waiting: Region | undefined;
  viewer.addOnceHandler('open', () => {
    opened = true;
    if (waiting) fit(waiting);
  });

  /** A rectangle of the picture, in its own pixels, kept within it and rounded to whole pixels. */
  const within = (x0: number, y0: number, x1: number, y1: number): Region | undefined => {
    const [left, right] = [Math.max(0, Math.round(Math.min(x0, x1))), Math.min(site.width, Math.round(Math.max(x0, x1)))];
    const [top, bottom] = [Math.max(0, Math.round(Math.min(y0, y1))), Math.min(site.height, Math.round(Math.max(y0, y1)))];
    return right - left >= 1 && bottom - top >= 1 ? { x: left, y: top, w: right - left, h: bottom - top } : undefined;
  };
  const area = ({ x, y, w, h }: Region) => image().imageToViewportRectangle(x, y, w, h);
  const fit = (region: Region) => viewer.viewport.fitBounds(area(region));

  let marks: HTMLElement[] = [];
  const unmark = () => {
    for (const mark of marks) viewer.removeOverlay(mark);
    marks = [];
  };

  // Marking a part: a press starts a box, a drag sizes it, and letting go makes it the part.
  let drawn: ((region: Region) => void) | undefined;
  let start: OpenSeadragon.Point | undefined;
  let end: OpenSeadragon.Point | undefined;
  const box = document.createElement('div');
  box.className = 'drawn-area';
  const boxAround = (a: OpenSeadragon.Point, b: OpenSeadragon.Point) =>
    new OpenSeadragon.Rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const tracker = new OpenSeadragon.MouseTracker({
    element: viewer.canvas,
    pressHandler: (event) => {
      if (!drawn) return;
      start = end = viewer.viewport.pointFromPixel(event.position);
      viewer.addOverlay({ element: box, location: boxAround(start, end) });
    },
    dragHandler: (event) => {
      if (!start) return;
      end = viewer.viewport.pointFromPixel(event.position);
      viewer.updateOverlay(box, boxAround(start, end));
    },
    releaseHandler: () => {
      if (!start || !end || !drawn) return;
      viewer.removeOverlay(box);
      const [a, b] = [image().viewportToImageCoordinates(start), image().viewportToImageCoordinates(end)];
      start = end = undefined;
      const region = within(a.x, a.y, b.x, b.y);
      if (!region) return; // a press without a drag marks nothing: still drawing
      const tell = drawn;
      picture.stopDrawing();
      tell(region);
    },
  });

  const picture: Picture = {
    inView() {
      if (!opened) return undefined;
      const { x, y, width, height } = image().viewportToImageRectangle(viewer.viewport.getBounds(true));
      return within(x, y, x + width, y + height);
    },
    show(region) {
      if (opened) fit(region);
      else waiting = region;
    },
    mark(regions, selected) {
      unmark();
      if (!opened) {
        viewer.addOnceHandler('open', () => picture.mark(regions, selected));
        return;
      }
      regions.forEach((region, i) => {
        if (!region) return;
        const outline = document.createElement('div');
        outline.className = 'note-area';
        if (i === selected) outline.dataset.selected = '';
        const number = document.createElement('button');
        number.type = 'button';
        number.className = 'note-marker';
        number.textContent = String(i + 1);
        number.setAttribute('aria-label', `Note ${i + 1}`);
        number.addEventListener('pointerdown', (event) => event.stopPropagation()); // a press, not the start of a drag
        number.addEventListener('click', () => onChoose(i));
        outline.append(number);
        viewer.addOverlay({ element: outline, location: area(region) });
        marks.push(outline);
      });
    },
    draw(onDrawn) {
      drawn = onDrawn;
      viewer.setMouseNavEnabled(false);
      el.classList.add('drawing');
    },
    stopDrawing() {
      drawn = undefined;
      if (start) viewer.removeOverlay(box);
      start = end = undefined;
      viewer.setMouseNavEnabled(true);
      el.classList.remove('drawing');
    },
    home: () => viewer.viewport.goHome(),
    destroy() {
      tracker.destroy();
      viewer.destroy();
    },
  };
  return picture;
}
