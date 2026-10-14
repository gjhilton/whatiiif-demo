import { useCallback, useEffect, useRef, useState } from 'react';
import type { Site, ViewerId } from './site';
import { chooseLanguage, inLanguage, languageName } from './language';
import { embedCode, linkTo, readAddress, withChoice, withRegion, withinImage, type Region } from './address';
import { viewers } from './viewers';
import { ViewerPane } from './components/ViewerPane';
import { Details } from './components/Details';
import { Embed } from './components/Embed';
import { Toggle } from './components/Toggle';

const VIEWER_IDS = Object.keys(viewers) as ViewerId[];

/** Changes the address without reloading or adding to the browser's history, so it stays a link to what is shown. */
const showInAddress = (href: string) => {
  if (href !== location.href) history.replaceState(null, '', href);
};

export function App({ site }: { site: Site }) {
  const [asked] = useState(() => readAddress(location.href, site, VIEWER_IDS));
  const [viewer, setViewer] = useState(asked.viewer ?? site.viewer);
  const [language, setLanguage] = useState(() => chooseLanguage(site, [asked.language, ...navigator.languages]));
  const [region, setRegion] = useState(asked.region);
  // Where a newly mounted viewer opens: the region in the link, then wherever the visitor has got to.
  const current = useRef(region);

  const onRegionChange = useCallback(
    (seen: Region) => {
      const next = withinImage(seen, site);
      current.current = next;
      setRegion(next);
      showInAddress(withRegion(location.href, next));
    },
    [site],
  );
  const switchViewer = (id: ViewerId) => {
    setViewer(id);
    showInAddress(withChoice(location.href, 'viewer', id));
  };
  const switchLanguage = (tag: string) => {
    setLanguage(tag);
    showInAddress(withChoice(location.href, 'lang', tag));
  };

  const title = inLanguage(site.title, language, site);
  const summary = site.summary && inLanguage(site.summary, language, site);
  useEffect(() => {
    document.title = title.text;
  }, [title.text]);

  const viewerPane = <ViewerPane site={site} viewer={viewer} language={language} startAt={current} onRegionChange={onRegionChange} />;
  const link = linkTo(site, { viewer, language, region });
  if (asked.embed) {
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
            <Toggle label="Language" options={site.languages} chosen={language} onChoose={switchLanguage} name={languageName} lang />
          )}
          <Toggle label="Viewer" options={VIEWER_IDS} chosen={viewer} onChoose={switchViewer} name={(id) => viewers[id].label} />
        </div>
      </header>
      {viewerPane}
      <main className="content">
        <Details site={site} language={language} link={link} embed={embedCode(linkTo(site, { viewer, language, region, embed: true }), title.text)} />
      </main>
    </>
  );
}
