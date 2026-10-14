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

`npm run test:visual` compares the page, in each state a visitor can meet, with reviewed screenshots in
`engine/test/visual/screenshots` (one set per operating system, since fonts differ; CI checks the Linux set). After
a deliberate change to how the page looks, run `npm run test:visual -- --update-snapshots`, look at every new
picture, and commit them. For the Linux set, push and take them from the failed CI run's `visual-differences`
artifact.

The page's colours are all in `engine/client/src/colours.css`; nothing else names a colour, and both viewers take
theirs from it.

To check a site that is already live:

```sh
E2E_SITE_URL=https://you.github.io/your-image node --test engine/test/e2e/check-site.js
```

CI (`.github/workflows/ci.yml`) runs all of this, plus a rehearsal of the deploy script on a sample image served
over HTTP.

## On real GitHub

The tests above run what the workflows run, but not the workflows themselves, GitHub Pages or Git LFS on GitHub.
Two checks cover those:

- **Live** (`.github/workflows/live.yml`), after every change to `main`: pushes the template to the demo repository
  named by the `DEMO_REPOSITORY` variable, keeping its `content/`, waits for the demo's own Deploy workflow and runs
  `check-site.js` on the live site (`engine/test/live/deploy-demo.sh`). It pushes with a deploy key for the demo
  only, stored as the `DEMO_DEPLOY_KEY` secret. Copies of the template have no `DEMO_REPOSITORY` and skip it.
- **`npm run test:live`**, by hand, about ten minutes. Each file makes its own public repository with "Use this
  template" (`engine/test/live/trial.js`), using your `gh` login, and deletes it afterwards if `gh` may
  (`gh auth refresh -s delete_repo`, once); otherwise it names the repository to delete by hand.
  - `github.live.js` puts this commit of the template in its repository and does what a newcomer might. It uploads
    a picture before switching Pages on and expects the run to say how to fix that, switches Pages on and re-runs,
    then pushes a picture too big for the browser through Git LFS, sized so the site comes near the Pages limit.
  - `update.live.js` starts its repository on the previous release, publishes a picture, runs the Update workflow
    and expects a pull request for the latest release that changes only `engine/` and the package files. Merging
    it must republish the site. Run it after each release.

## Releasing

Copies of the template update themselves from the repository named in `engine/UPSTREAM`
(`.github/workflows/update.yml` and `engine/ci/update.sh`). To release, bump `engine/VERSION` and publish a GitHub
release tagged `vX.Y.Z`. An update replaces `engine/`, `package.json` and `package-lock.json` only. GitHub does not
let the workflow change workflow files, so users copy those by hand; the pull request says when they need to.
