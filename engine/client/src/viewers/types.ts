import type { Site } from '../site';
import type { Region } from '../view';

export interface MountOptions {
  /** The language the visitor reads the page in; viewers with their own interface use it too. */
  language: string;
  /** The part of the picture to open on, if a link asked for one. */
  region?: Region;
  /** Told the part of the picture on screen whenever the visitor stops moving it (not yet clipped to the image). */
  onRegionChange: (region: Region) => void;
}

/** A viewer adapter renders the IIIF resources into `el` and returns a teardown function. */
export interface ViewerAdapter {
  mount(el: HTMLElement, site: Site, options: MountOptions): () => void;
}

export interface ViewerEntry {
  label: string;
  /** Lazy, so a viewer's bundle is only downloaded when it is chosen. */
  load: () => Promise<ViewerAdapter>;
}
