import type { Site } from '../site';
import { inLanguage } from '../language';
import { CopyField } from './CopyField';

/** `link` is the address of the page as it is being looked at, view and all; `embed` the HTML that shows that view elsewhere. */
export function Details({ site, language, link, embed }: { site: Site; language: string; link: string; embed: string }) {
  const { manifestUrl, infoUrl, fullUrl, originalUrl, rights } = site;
  const words = (text: Site['title']) => inLanguage(text, language, site);
  const description = site.description && words(site.description);
  const attribution = site.attribution && words(site.attribution);
  // [label, value], each with the language it is in; our own label and the dimensions need none
  const rows: { text: string; lang?: string }[][] = [
    ...site.metadata.map(({ label, value }) => [words(label), words(value)]),
    [{ text: 'Dimensions' }, { text: `${site.width.toLocaleString()} × ${site.height.toLocaleString()} px` }],
  ];

  return (
    <div className="details">
      <section>
        {description && <div className="prose" lang={description.lang} dangerouslySetInnerHTML={{ __html: description.text }} />}
        <table className="meta">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label.text}>
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
                <td><a href={rights}>{rights}</a></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Use this image in any IIIF viewer</h2>
        <CopyField label="Manifest URL" value={manifestUrl} />
        <CopyField label="Image service (info.json)" value={infoUrl} />
        <CopyField label="Link to this view" value={link} />
        <CopyField label="Embed on a web page" value={embed} />
        <p className="links">
          <a href={`https://projectmirador.org/embed/?iiif-content=${encodeURIComponent(manifestUrl)}`}>Open in Mirador</a>
          <a href={`https://uv-v4.netlify.app/#?manifest=${encodeURIComponent(manifestUrl)}`}>Open in Universal Viewer</a>
          <a href={manifestUrl}>View manifest</a>
        </p>
        {(fullUrl || originalUrl) && (
          <p className="links">
            {fullUrl && <a href={fullUrl}>Download full-size JPEG</a>}
            {originalUrl && <a href={originalUrl}>Download original file</a>}
          </p>
        )}
      </section>
    </div>
  );
}
