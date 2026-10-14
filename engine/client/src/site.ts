export type ViewerId = 'openseadragon' | 'mirador';

/** One text in each language it was written in, such as { en: 'Harbour', cy: 'Harbwr' }. */
export type Text = Record<string, string>;

/** Everything the page knows about the image. Written next to the page by engine/build.js. */
export interface Site {
  /** The language plain texts are in, and the fallback for a text missing in the visitor's language. */
  language: string;
  /** Every language some text is in, the site language first. */
  languages: string[];
  title: Text;
  summary?: Text;
  attribution?: Text;
  /** Describes the image for people who cannot see it. */
  alt: Text;
  rights?: string;
  metadata: { label: Text; value: Text }[];
  /** HTML made from content/description*.md when the site was built. */
  description?: Text;
  viewer: ViewerId;
  manifestUrl: string;
  /** The manifest's one canvas; Mirador keeps a starting view only when it is told which canvas to open. */
  canvasId: string;
  infoUrl: string;
  fullUrl?: string;
  originalUrl?: string;
  width: number;
  height: number;
  /** The page's own public address. */
  pageUrl: string;
}

/** Loaded when the page opens, so the same built page serves any image. */
export async function loadSite(): Promise<Site> {
  const response = await fetch('./site.json');
  if (!response.ok) throw new Error(`site.json answered ${response.status}`);
  return response.json();
}
