// IIIF language maps: each language's text in an array. `text` is one of the config's language maps.
const languageMap = (text) => Object.fromEntries(Object.entries(text).map(([language, words]) => [language, [words]]));
const english = (words) => ({ en: [words] }); // our own words, not the site author's

/** Builds a Presentation API 3.0 manifest wrapping the static image service. */
export function buildManifest({ manifestId, imageId, info, config, hasFull, originalUrl }) {
  const { width, height } = info;
  const sizes = info.sizes ?? [];
  const url = (size) => `${imageId}/full/${size}/0/default.jpg`;

  // With full/max unpublished the largest listed size stands in for the painted image.
  const largest = sizes[sizes.length - 1];
  const painted = hasFull || !largest ? { size: 'max', width, height } : { size: `${largest.width},${largest.height}`, ...largest };
  const smallest = sizes[0];
  const service = [{ id: imageId, type: 'ImageService3', profile: 'level0' }];

  const canvasId = `${manifestId.replace(/\/manifest\.json$/, '')}/canvas/1`;
  const manifest = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: manifestId,
    type: 'Manifest',
    label: languageMap(config.title),
    ...(config.summary && { summary: languageMap(config.summary) }),
    ...(config.attribution && {
      requiredStatement: { label: english('Attribution'), value: languageMap(config.attribution) },
    }),
    ...(config.rights && { rights: config.rights }),
    ...(config.metadata?.length && {
      metadata: config.metadata.map(({ label, value }) => ({ label: languageMap(label), value: languageMap(value) })),
    }),
    thumbnail: [
      {
        id: smallest ? url(`${smallest.width},${smallest.height}`) : url(painted.size),
        type: 'Image',
        format: 'image/jpeg',
        service,
      },
    ],
    ...(originalUrl && { rendering: [{ id: originalUrl, type: 'Image', label: english('Original file') }] }),
    items: [
      {
        id: canvasId,
        type: 'Canvas',
        width,
        height,
        items: [
          {
            id: `${canvasId}/page`,
            type: 'AnnotationPage',
            items: [
              {
                id: `${canvasId}/page/image`,
                type: 'Annotation',
                motivation: 'painting',
                target: canvasId,
                body: {
                  id: url(painted.size),
                  type: 'Image',
                  format: 'image/jpeg',
                  width: painted.width,
                  height: painted.height,
                  service,
                },
              },
            ],
          },
        ],
      },
    ],
  };
  return manifest;
}
