import { useEffect, useRef, useState, type RefObject } from 'react';
import { viewers } from '../viewers';
import type { Site, ViewerId } from '../site';
import { inLanguage } from '../language';
import type { Region } from '../address';

interface Props {
  site: Site;
  viewer: ViewerId;
  language: string;
  /** The part of the picture a newly mounted viewer opens on: the one in the link, then wherever the visitor got to. */
  startAt: RefObject<Region | undefined>;
  onRegionChange: (region: Region) => void;
}

/** Mounts the chosen viewer adapter into a fresh container and tears it down on change. */
export function ViewerPane({ site, viewer, language, startAt, onRegionChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const alt = inLanguage(site.alt, language, site);
  const viewerLanguage = viewers[viewer].localised ? language : site.language;

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    const el = document.createElement('div');
    el.className = 'viewer-surface';
    host.current?.replaceChildren(el);
    setError(undefined);

    viewers[viewer]
      .load()
      .then((adapter) => {
        if (!cancelled) teardown = adapter.mount(el, site, { language: viewerLanguage, region: startAt.current, onRegionChange });
      })
      .catch((e: Error) => setError(`Could not load ${viewers[viewer].label}: ${e.message}`));

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [site, viewer, viewerLanguage, startAt, onRegionChange]);

  return (
    <div className="viewer" role="region" aria-label="Image viewer" aria-describedby="viewer-alt">
      <p id="viewer-alt" className="visually-hidden" lang={alt.lang}>{alt.text}</p>
      <div className="viewer-host" ref={host} />
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
}
