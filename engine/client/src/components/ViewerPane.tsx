import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { viewers } from '../viewers';
import type { MountedViewer } from '../viewers/types';
import type { Site, ViewerId } from '../site';
import { inLanguage } from '../language';
import type { Region } from '../address';

interface Props {
  site: Site;
  viewer: ViewerId;
  language: string;
  /** The part of the picture a newly mounted viewer opens on: the one in the link, then wherever the visitor got to. */
  startAt: RefObject<Region | undefined>;
  /** A part of the picture to move to, as a detail link asks; each new object is a new request. */
  goTo?: { region: Region };
  onRegionChange: (region: Region) => void;
  /** Inside someone else's page. */
  embedded: boolean;
}

const DARK = '(prefers-color-scheme: dark)';

/** Mounts the chosen viewer adapter into a fresh container and tears it down on change. */
export function ViewerPane({ site, viewer, language, startAt, goTo, onRegionChange, embedded }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<MountedViewer>(undefined);
  const [error, setError] = useState<string>();
  const alt = inLanguage(site.alt, language, site);
  const viewerLanguage = viewers[viewer].localised ? language : site.language;
  // The viewers take the page's colours when they open, so one opens again when the computer turns dark or light.
  const [dark, setDark] = useState(() => matchMedia(DARK).matches);
  useEffect(() => {
    const query = matchMedia(DARK);
    const change = () => setDark(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement('div');
    el.className = 'viewer-surface';
    host.current?.replaceChildren(el);
    setError(undefined);
    const fail = (message: string) => {
      if (!cancelled) setError(message);
    };

    viewers[viewer]
      .load()
      .then((adapter) => {
        if (cancelled) return;
        mounted.current = adapter.mount(el, site, {
          language: viewerLanguage,
          region: startAt.current,
          onRegionChange,
          onError: fail,
          cooperative: embedded,
        });
      })
      .catch((e: Error) => fail(`Could not load ${viewers[viewer].label}: ${e.message}`));

    return () => {
      cancelled = true;
      mounted.current?.destroy();
      mounted.current = undefined;
    };
  }, [site, viewer, viewerLanguage, startAt, onRegionChange, embedded, dark]);

  useEffect(() => {
    if (!goTo) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.current?.parentElement?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
    mounted.current?.show(goTo.region); // a viewer still loading opens there anyway: startAt has it
  }, [goTo]);

  // Tall enough for the picture's shape at the page's width, between 22rem and most of the window.
  const shape = { '--shape': site.width / site.height } as CSSProperties;
  return (
    <div className="viewer" style={shape} role="region" aria-label="Image viewer" aria-describedby="viewer-alt">
      <p id="viewer-alt" className="visually-hidden" lang={alt.lang}>{alt.text}</p>
      <div className="viewer-host" ref={host} />
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
}
