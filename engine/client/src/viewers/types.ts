import type { Site } from '../site';
import type { Region } from '../address';

export interface MountOptions {
  /** The language for the viewer's own words: the visitor's for a `localised` viewer, else the site's. */
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
  /** Whether the viewer shows words of its own, and so is opened again when the visitor changes language. */
  localised?: boolean;
  /** Lazy, so a viewer's bundle is only downloaded when it is chosen. */
  load: () => Promise<ViewerAdapter>;
}
