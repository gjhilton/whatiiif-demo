import type { Site } from '../site';
import type { Region } from '../address';

export interface MountOptions {
  /** The language for the viewer's own words: the visitor's for a `localised` viewer, else the site's. */
  language: string;
  /** The part of the picture to open on, if a link asked for one. */
  region?: Region;
  /** Told the part of the picture on screen whenever the visitor stops moving it (not yet clipped to the image). */
  onRegionChange: (region: Region) => void;
  /** Told why, if the picture cannot be opened. */
  onError: (message: string) => void;
  /** Inside someone else's page: leave a plain scroll or a one-finger drag to scroll that page, where the viewer can. */
  cooperative: boolean;
  /** Told which note's marker the visitor chose, if the picture has notes and markers are to be shown for them. */
  onNote?: (index: number) => void;
}

/** A viewer showing the picture: it can be moved to show a part of it, and taken down. */
export interface MountedViewer {
  show(region: Region): void;
  destroy(): void;
}

/** A viewer adapter renders the IIIF resources into `el`. */
export interface ViewerAdapter {
  mount(el: HTMLElement, site: Site, options: MountOptions): MountedViewer;
}

export interface ViewerEntry {
  label: string;
  /** Whether the viewer shows words of its own, and so is opened again when the visitor changes language. */
  localised?: boolean;
  /** Lazy, so a viewer's bundle is only downloaded when it is chosen. */
  load: () => Promise<ViewerAdapter>;
}
