import type { ReactNode } from 'react';
import type { Site } from '../site';
import { inLanguage } from '../language';

/** The page as it appears inside someone else's: the viewer, then a line of credit linking back to the full page. */
export function Embed({ site, language, fullPage, children }: { site: Site; language: string; fullPage: string; children: ReactNode }) {
  const title = inLanguage(site.title, language, site);
  const attribution = site.attribution && inLanguage(site.attribution, language, site);
  return (
    <div className="embed">
      {children}
      <p className="credit">
        <span lang={title.lang}>{title.text}</span>
        {attribution && (
          <>
            {' · '}
            <span lang={attribution.lang}>{attribution.text}</span>
          </>
        )}
        <a href={fullPage} target="_blank" rel="noopener" aria-label="Open the full page" title="Open the full page">
          ↗
        </a>
      </p>
    </div>
  );
}
