import type { MouseEvent } from 'react';
import type { Site } from '../site';
import { inLanguage } from '../language';
import { regionLinked, type Region } from '../address';
import { fileSize, formatName, rightsName } from '../describe';
import { CopyField } from './CopyField';

interface Props {
  site: Site;
  language: string;
  /** The address of the page as it is being looked at, view and all. */
  link: string;
  /** The HTML that shows that view on another page. */
  embed: string;
  /** Moves the viewer to a part of the picture, as a detail link in the description asks. */
  show: (region: Region) => void;
}

export function Details({ site, language, link, embed, show }: Props) {
  const { manifestUrl, infoUrl, fullUrl, originalUrl, rights } = site;
  const words = (text: Site['title']) => inLanguage(text, language, site);
  const description = site.description && words(site.description);
  const attribution = site.attribution && words(site.attribution);
  // [label, value], each with the language it is in; our own label and the dimensions need none
  const rows: { text: string; lang?: string }[][] = [
    ...site.metadata.map(({ label, value }) => [words(label), words(value)]),
    [{ text: 'Dimensions' }, { text: `${site.width.toLocaleString()} × ${site.height.toLocaleString()} px` }],
  ];

  // A link in the description to a part of the picture moves the viewer there rather than opening the page again.
  const followDetailLink = (event: MouseEvent) => {
    const link = (event.target as Element).closest('a');
    const region = link && regionLinked(link.href, site, location.href);
    if (!region || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    show(region);
  };

  return (
    <div className="details">
      <section>
        {description && (
          <div className="prose" lang={description.lang} onClick={followDetailLink} dangerouslySetInnerHTML={{ __html: description.text }} />
        )}
        <table className="meta">
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i}>
                <th scope="row" lang={label.lang}>{label.text}</th>
                <td lang={value.lang}>{value.text}</td>
              </tr>
            ))}
            {attribution && (
              <tr>
                <th scope="row">Attribution</th>
                <td lang={attribution.lang}>{attribution.text}</td>
              </tr>
            )}
            {rights && (
              <tr>
                <th scope="row">Rights</th>
                <td><a href={rights}>{rightsName(rights)}</a></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Share this view</h2>
        <CopyField label="Link to this view" value={link} />
        <CopyField label="Embed on a web page" value={embed} />

        <h2>Use it in any IIIF viewer</h2>
        <CopyField label="Manifest URL" value={manifestUrl} />
        <CopyField label="Image service (info.json)" value={infoUrl} />
        <p className="links">
          <a href={`https://projectmirador.org/embed/?iiif-content=${encodeURIComponent(manifestUrl)}`}>Open in Mirador</a>
          <a href={`https://uv-v4.netlify.app/#?manifest=${encodeURIComponent(manifestUrl)}`}>Open in Universal Viewer</a>
          <a href={manifestUrl}>View manifest</a>
        </p>

        {(fullUrl || originalUrl) && (
          <>
            <h2>Download</h2>
            <p className="links">
              {fullUrl && <a href={fullUrl}>Full-size JPEG{site.fullBytes && ` (${fileSize(site.fullBytes)})`}</a>}
              {originalUrl && (
                <a href={originalUrl} rel="nofollow">
                  Original file
                  {site.originalFormat && ` (${[formatName(site.originalFormat), site.originalBytes && fileSize(site.originalBytes)].filter(Boolean).join(', ')})`}
                </a>
              )}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
