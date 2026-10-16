# WhatIIIF, for LLMs and coding assistants

Hello! You are helping someone put a picture on the web with WhatIIIF, and we are glad you are. This page has what
you need to make them a site and get it right. (People doing it by hand want the [Quickstart](QUICKSTART.md); the
[README](../README.md) is the full manual.)

## What it is

- A GitHub template repository, [`gjhilton/WhatIIIF`](https://github.com/gjhilton/WhatIIIF). Each site is a
  **public** repository made from it, holding **one** picture in `content/`. One picture per site is by design: for
  another picture, make another repository.
- On every push, the repository's **Deploy** workflow builds the site on GitHub Actions (IIIF level-0 tiles, a IIIF
  manifest, and a page with the OpenSeadragon and Mirador viewers) and publishes it with GitHub Pages, at
  `https://OWNER.github.io/REPOSITORY/`. Nothing is built or installed on the user's computer.
- `content/` is the user's; everything else is WhatIIIF's, and the weekly **Update** workflow replaces it with each
  release. Change only `content/`.

## Make a site with the GitHub CLI

With `gh` signed in as the user (`gh auth status`):

```sh
owner=$(gh api user --jq .login)
gh repo create my-picture --template gjhilton/WhatIIIF --public   # public: GitHub Pages is free for public repositories
# GitHub copies the template a few seconds after making the repository.
until gh api "repos/$owner/my-picture/contents/engine/VERSION" --silent 2> /dev/null; do sleep 5; done
gh repo clone my-picture && cd my-picture

gh api -X POST "repos/{owner}/{repo}/pages" -f build_type=workflow   # GitHub Pages, published by Actions
# Lets the weekly Update workflow open its pull requests. Sites' workflows ask for the permissions they need.
gh api -X PUT "repos/{owner}/{repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

cp /path/to/harbour.tif content/
git add content && git commit -m "The picture" && git push
gh run watch --exit-status "$(gh run list --workflow Deploy --commit "$(git rev-parse HEAD)" --json databaseId --jq '.[0].databaseId')"
```

`gh run list` can take a few seconds to show the new run. When the run ends green, the site is at
`https://$owner.github.io/my-picture/`, the owner lower-cased. Without a terminal, walk the user through the
[Quickstart](QUICKSTART.md) instead: five steps in the browser.

## The picture

- **Exactly one** image in `content/`: TIFF, PNG, JPEG, WebP, AVIF or GIF. iPhone photos (HEIC) are not supported:
  convert to JPEG first (on a Mac: `sips -s format jpeg in.heic --out out.jpg`).
- **Size:** the browser uploads up to 25 MB, and Git pushes up to 100 MB. Larger, up to 2 GB: `.gitattributes` stores
  `content/` images with Git LFS, so run `git lfs install` before `git add` (free accounts include 10 GiB of LFS
  storage and 10 GiB of downloads a month; each build downloads the picture once). Or upload it to a GitHub release
  and give its download link as `picture = "…"` in `content/whatiiif.toml`, with no image in `content/`.
- **Big sites fit:** GitHub Pages takes up to 1 GB, and the build makes room by itself, leaving out the full-size JPEG
  and lowering the JPEG quality of the tiles if it must.
- **Privacy:** the tiles and JPEGs the site makes leave out camera and location details, but the original file keeps
  them, in the public repository and as a download. If a photo has a location, remove it before committing (for
  example `exiftool -gps:all= -overwrite_original photo.jpg`), and tell the user why.
- To change the picture, remove the old file and add the new one in the same commit.

## Settings: `content/whatiiif.toml`

All optional, and checked by the build, which explains any mistake in a sentence. The template's copy of the file
documents each one in a comment.

| Setting | What it is |
|---|---|
| `title` | Shown as the heading. Defaults to the file name. |
| `summary` | One line under the title. |
| `creator`, `date` | Who made the picture and when; free text (`date = "about 1890"`). |
| `attribution` | The credit line, and any terms besides the licence. |
| `alt` | What the picture shows, for people who cannot see it. Defaults to the title: write a real one. |
| `rights` | The licence: a Creative Commons or RightsStatements.org URL only. |
| `dimensions` | The original's real size, `"120 x 80 cm"` (mm, cm, m or in). Gives a scale bar. |
| `language` | The language the texts are in, as a tag: `en` (the default), `cy`, `de-CH`. |
| `viewer` | `"openseadragon"` (the default) or `"mirador"`; visitors can switch. |
| `picture` | The URL of a picture too big to commit, such as a release asset. |
| `base_url` | Only for a custom domain set up under Settings → Pages: `"https://example.org"`. |
| `[[metadata]]` | Any other details, each `label = "…"` and `value = "…"`; repeat the block for each. |
| `[tiles]` | `size` (64 to 4096, default 512) and `quality` (1 to 100, default 85). |
| `[publish]` | `full`, `original` and `footer`, each `true` (the default) or `false`: the full-size JPEG download, the original file's download, and the "Published with WhatIIIF" line. |
| `[colours]` | `paper`, `ink`, `viewer` and `error`, any CSS colour. Keep a contrast of at least 4.5 to 1 between `ink` and `paper`. |

Any text can be in several languages: `title = { en = "Harbour", cy = "Harbwr" }`. A plain string is in `language`.

```toml
title = "Harbour at dusk"
creator = "A. Painter"
date = "1890"
attribution = "Example Museum"
alt = "Fishing boats entering a harbour under an orange sky"
rights = "https://creativecommons.org/licenses/by/4.0/"
dimensions = "120 x 80 cm"
```

## Words: `content/description.md` and `content/notes.md`

- **`description.md`** is a longer description, in Markdown, shown on the page. `description.cy.md` and so on add
  other languages. A link to `#xywh=x,y,w,h` takes the viewer to that part of the picture.
- **`notes.md`** is optional: notes on parts of the picture, which make a tour. Each note is a `##` heading linking to
  its part, in the picture's own pixels from its top left, then the note's text. Anything before the first note
  introduces them. `notes.cy.md` and so on give the same notes, in the same order, in other languages; their headings
  need no links.

```markdown
Three things to look for.

## [The lighthouse](#xywh=1200,300,400,900)

Built in 1846, and still lit.

## [The boats](#xywh=2400,1800,900,500)

The fishing fleet, coming home.
```

A part must lie within the picture: read its width and height before writing notes. Once the site is up, the user can
also write and arrange notes in the notes helper (below).

## Doing it well

- **Ask, don't guess,** what the picture is, who made it and when, whom to credit, and its licence. Only the user
  knows whether they have the right to publish it.
- **Write the alt text with the user:** a sentence or two saying what the picture shows. For a map or a manuscript,
  put the words on it, or a transcription, in `description.md`: for someone who cannot see the picture, that is the
  picture.
- If the texts are not in English, set `language`, or screen readers read them with English pronunciation.
- Change only `content/`. Never edit `engine/`, `package*.json` or `.github/workflows/`: updates replace them.

## When it goes wrong

The Deploy run's page says what went wrong at the top, in a sentence; `gh run view RUN --log-failed` shows it too.
Most messages say what to fix. The common ones:

- **GitHub Pages is not enabled:** enable it (the `gh api … /pages` line above), then `gh run rerun RUN --failed`.
- **content/ must contain exactly one image:** remove the others.
- **content/whatiiif.toml: …** or **content/notes.md: …**: fix what it names, as it says.
- **Timeout, or deployment cancelled:** GitHub Pages was slow; push any small change to start again.

## Once it is live

Tell the user their site's address and its two helpers: `https://OWNER.github.io/REPOSITORY/settings.html`, a form
that writes `whatiiif.toml`, and `.../notes.html`, which writes `notes.md`. Under the picture are links to share,
embed and cite any view. Once a week the Update workflow offers each new release of WhatIIIF as a pull request: merge
it. If a release changes one of the user's own workflow files, which a workflow may not change, the pull request says
which to copy by hand.

More: the [README](../README.md) is the manual; [DEVELOPING.md](DEVELOPING.md) is for work on WhatIIIF itself.
