import { useCallback, useEffect, useRef, useState } from 'react';
import type { Site, ViewerId } from './site';
import { chooseLanguage, inLanguage, languageName } from './language';
import { embedCode, pageLink, regionFromHash, regionHash, withinImage, type Region } from './view';
import { viewers } from './viewers';
import { ViewerPane } from './components/ViewerPane';
import { Details } from './components/Details';
import { Embed } from './components/Embed';

const initialViewer = (site: Site): ViewerId => {
  const asked = new URLSearchParams(location.search).get('viewer');
  return asked && asked in viewers ? (asked as ViewerId) : site.viewer;
};

/** Keeps a choice in the address, so a copied link opens the page the same way. */
const remember = (key: string, value: string) => {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  history.replaceState(null, '', url);
};

export function App({ site }: { site: Site }) {
  const [viewer, setViewer] = useState(() => initialViewer(site));
  const [language, setLanguage] = useState(() => chooseLanguage(site));
  const [region, setRegion] = useState(() => regionFromHash(location.hash, site));
  const current = useRef(region);

  // Keep the part of the picture on screen in the address, so the address is a link to it.
  const onRegionChange = useCallback(
    (seen: Region) => {
      const next = withinImage(seen, site);
      current.current = next;
      setRegion(next);
      if (location.hash === regionHash(next)) return;
      const url = new URL(location.href);
      url.hash = regionHash(next);
      history.replaceState(null, '', url);
    },
    [site],
  );
  const title = inLanguage(site.title, language, site);
  const summary = site.summary && inLanguage(site.summary, language, site);
  useEffect(() => {
    document.title = title.text;
  }, [title.text]);

  const viewerPane = <ViewerPane site={site} viewer={viewer} language={language} startAt={current} onRegionChange={onRegionChange} />;
  const link = pageLink(site, { viewer, language, region });
  if (new URLSearchParams(location.search).has('embed')) {
    return (
      <Embed site={site} language={language} fullPage={link}>
        {viewerPane}
      </Embed>
    );
  }

  return (
    <>
      <header className="masthead">
        <div>
          <h1 lang={title.lang}>{title.text}</h1>
          {summary && <p lang={summary.lang}>{summary.text}</p>}
        </div>
        <div className="controls">
          {site.languages.length > 1 && (
            <div className="toggle" role="group" aria-label="Language">
              {site.languages.map((tag) => (
                <button key={tag} type="button" lang={tag} aria-pressed={tag === language} onClick={() => (setLanguage(tag), remember('lang', tag))}>
                  {languageName(tag)}
                </button>
              ))}
            </div>
          )}
          <div className="toggle" role="group" aria-label="Viewer">
            {(Object.keys(viewers) as ViewerId[]).map((id) => (
              <button key={id} type="button" aria-pressed={id === viewer} onClick={() => (setViewer(id), remember('viewer', id))}>
                {viewers[id].label}
              </button>
            ))}
          </div>
        </div>
      </header>
      {viewerPane}
      <main className="content">
        <Details site={site} language={language} link={link} embed={embedCode(pageLink(site, { viewer, language, region, embed: true }), title.text)} />
      </main>
    </>
  );
}
