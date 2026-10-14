# Developing whatiiif

## How it works

`content/` belongs to whoever uses the template; everything else belongs to the template. On every push that
touches either, the **Deploy** workflow (`.github/workflows/deploy.yml`) checks that `content/` holds an image
(`engine/ci/has-image.js`). It then runs `engine/ci/build.sh`, which builds the page (`engine/client/`, React and
Vite) and then the site (`engine/build.js` and `engine/lib/`):

- `slice.js` cuts the image into IIIF Image API 3.0 level 0 tiles with [sharp](https://sharp.pixelplumbing.com)
  (libvips). It first turns the image upright, flattens transparency onto white, converts it to sRGB using its
  colour profile, and drops its EXIF.
- `info.js` writes `info.json`. `requests.js` knows every file a viewer will ask for, and `validate.js` refuses to
  deploy a service that is missing any of them.
- `manifest.js` writes a IIIF Presentation 3.0 manifest from `content/whatiiif.toml`, which `config.js` reads.
- `page.js` writes the title, social-card tags and a no-JavaScript fallback into the built page. The page itself
  loads `site.json` when it opens, so it is the same for every image.

The original file is not published; the manifest links to it in the repository (`original.js`). If the site would
exceed GitHub Pages' size limit, the full-size JPEG is dropped first (`budget.js`).

## Working on it

Needs Node 22 or newer.

```sh
npm install
npm run build        # page and site from content/ into dist/; put an image in content/ first
npm run preview      # http://localhost:4173
npm test             # unit and integration tests, a few seconds
npm run typecheck
npx playwright install chromium-headless-shell   # once
npm run test:e2e     # whole journeys in a real browser, about a minute
```

`test:e2e` makes repositories from the template and commits images to them the way people do: uploaded on
github.com, through Git LFS, in two languages, and with mistakes. It runs what the Deploy workflow runs and opens
each site in both viewers, failing if either asks for a file that was not published. It also runs the Update
workflow against a stand-in for GitHub.

To check a site that is already live:

```sh
E2E_SITE_URL=https://you.github.io/your-image node --test engine/test/e2e/check-site.js
```

CI (`.github/workflows/ci.yml`) runs all of this, plus a rehearsal of the deploy script on a sample image served
over HTTP.

## Releasing

Copies of the template update themselves from the repository named in `engine/UPSTREAM`
(`.github/workflows/update.yml` and `engine/ci/update.sh`). To release, bump `engine/VERSION` and publish a GitHub
release tagged `vX.Y.Z`. An update replaces `engine/`, `package.json` and `package-lock.json` only. GitHub does not
let the workflow change workflow files, so users copy those by hand; the pull request says when they need to.
