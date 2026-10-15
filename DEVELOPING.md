# Developing WhatIIIF

## How it works

`content/` belongs to whoever uses the template; everything else belongs to the template. On every push that
touches either, the **Deploy** workflow (`.github/workflows/deploy.yml`, which runs `publish.yml`) checks that
`content/` holds an image, or
that `whatiiif.toml` links to one (`engine/ci/has-image.js`). It then runs `engine/ci/build.sh`, which builds the page
(`engine/client/`, React and Vite) and then the site from the picture (`engine/build.js`, which runs
`engine/lib/build.js`). In a workflow run, `engine/build.js` also puts anything that went wrong, or is worth a look,
at the top of the run's page as annotations, with a summary below them (`report.js`).

- `content.js` reads `content/`: the one picture, or the one its `picture` setting links to, downloaded and told
  apart by its first bytes (`source.js`, which needs no npm packages because `has-image.js` runs before any are
  installed); `whatiiif.toml` through `config.js`, which explains every mistake in a sentence and suggests the
  setting meant (`spelling.js`); the descriptions, turned into HTML; any notes on the picture (`notes.js`, an
  optional extra); and any file it will not use.
- `slice.js` cuts the picture into IIIF Image API 3.0 level 0 tiles with [sharp](https://sharp.pixelplumbing.com)
  (libvips). It first turns the image upright, flattens transparency onto white, converts it to sRGB using its
  colour profile, and drops its EXIF.
- `service.js` holds what a static image service promises: its `info.json`, every file a viewer reading that will
  ask for, and which of those a folder is missing. The build refuses to deploy a service that is missing any.
- `budget.js` leaves out the full-size JPEG if the site would otherwise exceed GitHub Pages' size limit; if the
  tiles alone are still too big, `build.js` slices again at lower JPEG qualities, down to 45, until they fit.
- `manifest.js` writes the IIIF Presentation 3.0 manifest, with any notes on the picture as commenting annotations.
  The original file is not published; the manifest links to it in the repository (`original.js`), unless the
  repository is private or the owner says not to, or at the address it was downloaded from.
- `page.js` writes, at the top of every page, a comment saying it was published with WhatIIIF, which version, and
  where WhatIIIF and the site come from. Into the main page it also writes the title, icon (cut from the picture),
  the owner's colours, social-card tags, a no-JavaScript fallback and `site.json` itself, between marker comments,
  so the page Vite builds is the same for every image. A page without them (Vite's own) loads `site.json` instead.

The page (`engine/client/src/`): `App.tsx` holds what is on screen (viewer, language, part of the picture),
`address.ts` reads and writes the page's address so that any view is a link (and a link in the description can
point at a detail), `language.ts` chooses the visitor's language, `describe.ts` names licences and downloads, and
`viewers/` holds one adapter per viewer, each downloaded only when it is chosen. An adapter mounts its viewer, can
move it to a part of the picture, and reports where the visitor has moved it. Notes, when a site has them, are
`components/Notes.tsx` (the list), `components/Tour.tsx`, and markers the OpenSeadragon adapter puts on the picture;
Mirador lists them from the manifest. None of these appear in an embedded view. Every colour is in `colours.css`, with
black and white swapped for dark mode; nothing else names one, and both viewers take theirs from it (`colours.ts`),
opening again if the computer switches between light and dark.

The owner's two helpers are pages of their own, built beside the main one and published with every site. They save
nothing: each writes a file for its owner to paste into GitHub, checked by the build's own code. `settings/` writes
`whatiiif.toml` (`config.js`, `write-config.js`); `notes/` writes `notes.md` (`readNotesSource` and
`writeNotesSource` in `notes.js`), its parts of the picture marked on the picture itself (`notes/picture.ts`). The
build gives them the files as written, in `settings.json`.

A copy's own `deploy.yml` and `update.yml` say only when to run: they call `publish.yml` and `offer-update.yml` in
this repository at the tag of their major version (`v1` for 1.x), which each release of that major version moves
(`release.yml`), so steps improve in every copy without anyone copying a workflow file. Those run the copy's own
`engine/ci/has-image.js`, `engine/ci/build.sh`, `engine/ci/update.sh` and `engine/.node-version`, and a copy may be on any earlier release, so those paths must stay
put and keep working as they do. A workflow whose first line is `# whatiiif: template only` is never passed on to
copies. To make a template of your own from this one, change `gjhilton/WhatIIIF` in `deploy.yml` and `update.yml`
as well as in `engine/UPSTREAM`.

## Working on it

Needs Node 24 or newer.

```sh
npm install
npm run build        # page and site from content/ into dist/; put an image in content/ first
npm run preview      # http://localhost:4173
npm test             # unit and integration tests, about twenty seconds
npm run typecheck
npx playwright install chromium-headless-shell webkit   # once
npm run test:e2e     # whole journeys in real browsers, about two minutes
npm run test:visual  # the page against reviewed screenshots
```

`engine/test/` holds:

- `*.test.js`, run by `npm test`: the engine, the page's own logic (Node runs its TypeScript as it is), and the
  workflows' scripts in `engine/ci/`, run against a stand-in for GitHub's `gh`.
- `e2e/`: repositories made from the template, with images committed the way people commit them: uploaded on
  github.com, through Git LFS, in two languages, and with mistakes. Each runs what the Deploy workflow runs and opens
  the site in both viewers, failing if either asks for a file that was not published. They run in Chromium;
  `safari.e2e.js` repeats the journeys most likely to differ in WebKit, on a Mac and on an iPhone, and
  `accessibility.e2e.js` checks every state of the page against WCAG 2.1 AA with axe. `check-site.js` checks any
  built or live site the same way.
- `visual/`: the page, in each state a visitor can meet, against reviewed screenshots in
  `engine/test/visual/screenshots` (one set per operating system, since fonts differ; CI checks the Linux set). After
  a deliberate change to how the page looks, run `npm run test:visual -- --update-snapshots`, look at every new
  picture, and commit them. For the Linux set, push and take them from the failed CI run's `visual-differences`
  artifact. The README's screenshots of the demos and the two helpers, in `engine/artwork`, are remade by Live
  (below); by hand, `node engine/test/support/readme-screenshots.js`.
- `live/`: tests on real GitHub (below).
- `support/`: what the tests share: test images, temporary folders, the IIIF schema, and the harness that copies the
  template, runs the Deploy workflow's steps and opens a site in a browser.

To check a site that is already live:

```sh
E2E_SITE_URL=https://you.github.io/your-image node --test engine/test/e2e/check-site.js
```

CI (`.github/workflows/ci.yml`) runs all of this, plus a rehearsal of the deploy script on a sample image served
over HTTP. It runs only in the template itself, not in copies made from it.

## On real GitHub

The tests above run what the workflows run, but not the workflows themselves, GitHub Pages or Git LFS on GitHub.
**Live** (`.github/workflows/live.yml`) covers those, and keeps everything outside this repository in step with it.
`main` is production: Live runs after every push to `main`, whatever it changed, after every release, and once a
day. Copies of the template have no
`DEMO_REPOSITORY` and skip it. Its jobs:

- **demo:** pushes the template to each demo repository, named by the `DEMO_REPOSITORY` variable (the plain demo) and
  `NOTES_DEMO_REPOSITORY` (the one with notes and a tour), keeping its `content/`, exactly as a site made from the
  template now would be (its workflows calling the steps at `v1`), waits for the demo's own Deploy workflow and runs
  `check-site.js` on the live site (`engine/test/live/deploy-demo.sh`). The steps of a commit not yet released are
  tried by the live trials, by hand. It pushes with a deploy key for each demo alone, stored as the
  `DEMO_DEPLOY_KEY` and `NOTES_DEMO_DEPLOY_KEY` secrets.
- **screenshots:** once both demos are up, remakes the README's screenshots of them on a Mac
  (`engine/test/support/readme-screenshots.js`) and commits to `main` any that look different. Pull before working.
- **released:** fails if the shared steps on `main` (`publish.yml`, `offer-update.yml`) are not those at the tag sites
  call them at (`v1` for 1.x): sites do not have them until a release moves that tag, so a release is due.
The trials in repositories made from the template are run by hand, not by Live: `npm run test:live` makes public
repositories with "Use this template" and tries the template in them as a newcomer would. Run them before every
release, and after any change to the workflows or to what they run (the build, Deploy, Update), once it is on `main`
or pushed. They use your `gh` login, with the trials' workflows calling the steps at the commit tried (so push it
first). Each repository is deleted afterwards if `gh` may (`gh auth refresh -s delete_repo`, once); otherwise the run
names the repository to delete by hand. The trials:

- `github.live.js` puts this commit of the template in its repository and does what a newcomer might. It uploads
  a picture before switching Pages on and expects the run to say how to fix that, switches Pages on and re-runs,
  then pushes a picture too big for the browser through Git LFS, sized so the site comes near the Pages limit.
- `release.live.js` puts a picture twice the browser's upload limit into a release of its repository, links to it in
  `whatiiif.toml` as the README says, and checks the site and the original's download.
- `update.live.js` starts its repository on the previous release, publishes a picture, runs the Update workflow and
  expects a pull request for the latest release that changes only `engine/` and the package files. Merging it must
  republish the site.

## Releasing

Copies of the template update themselves from the repository named in `engine/UPSTREAM`
(`.github/workflows/update.yml` and `engine/ci/update.sh`). To release, bump `engine/VERSION` and publish a GitHub
release tagged `vX.Y.Z`; `release.yml` then moves the tag of its major version to it (`v0` for 0.x, `v1` for 1.x;
a pre-release leaves it where it is), and every copy calling that tag runs its steps from then on. Run
`npm run test:live` by hand before and after releasing (see above). An update replaces `engine/`, `package.json` and `package-lock.json` only, and is
never offered to a copy already on that version or a later one. GitHub does not let the workflow change workflow
files, so users copy those by hand; the pull request says when they need to, leaving out any workflow marked
`# whatiiif: template only` (and `ci.yml` and `live.yml`, from before there was a marker).
