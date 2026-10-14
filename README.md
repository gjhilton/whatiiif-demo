# whatiiif

Put one large picture on the web, zoomable, for free: a map, a manuscript page, a painting, a photograph.
You upload the image to GitHub, and GitHub builds a website where anyone can zoom into it, share a link to any
detail, or embed it in their own page. The picture is also published as [IIIF](https://iiif.io), the standard
that museum and library viewers such as Mirador and Universal Viewer read.

You need a free GitHub account. Everything below happens in your web browser.

## Make your site

1. **Copy this template.** At the top of this page click **Use this template → Create a new repository**.
   Give it a name (it becomes part of your site's address), choose **Public**, and click **Create repository**.
2. **Switch on GitHub Pages.** In your new repository open **Settings → Pages**. Under **Source**, choose
   **GitHub Actions**.
3. **Add your picture.** Go to the **Code** tab, open the **content** folder, and choose
   **Add file → Upload files**. Drop in one TIFF, PNG or JPEG, then click **Commit changes**.
4. **Wait a minute or two.** The **Actions** tab shows your site being built. A green tick means it is ready.
5. **Visit your site** at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. The address is also shown under
   **Settings → Pages**.

The browser uploads files of up to 25 MB. For a bigger picture, see [Large pictures](#large-pictures).

## Describe your picture (optional)

Open `content/whatiiif.toml`, click the pencil icon to edit it, and fill in the lines you want. Remove the `#` at
the start of each line you use:

```toml
title = "Harbour at dusk"
summary = "The fishing fleet coming home, 1890."
attribution = "Example Museum"
alt = "Fishing boats entering a harbour under an orange sky"
rights = "https://creativecommons.org/licenses/by/4.0/"
```

Click **Commit changes** and the site rebuilds itself. For a longer description, add a file called
`content/description.md` (written in [Markdown](https://commonmark.org/help/)).

- **Other languages:** write any text like `title = { en = "Harbour", cy = "Harbwr" }`, and add
  `description.cy.md` next to `description.md`. Visitors see their own language and can switch.
- **rights** must be a Creative Commons or RightsStatements.org address. Put any other terms in `attribution`.
- Every setting is explained in the file itself.

## Share it

Under the picture on your site you will find, ready to copy:

- **Manifest URL**: paste it into any IIIF viewer.
- **Link to this view**: zoom into a detail first, and the link opens on exactly that.
- **Embed on a web page**: code that puts the zoomable picture into a blog post or another website.

Links to your site show the picture, title and summary when shared on social media or in chat apps.

## Change the picture

Delete the old file from the `content` folder and upload the new one. The site holds one picture at a time.

## If something goes wrong

Open the **Actions** tab and click the run with a red cross. The error explains what to fix:

| The error says | What to do |
|---|---|
| GitHub Pages is not enabled | Do step 2 above, then click **Re-run jobs**. |
| content/ must contain exactly one image | Delete the extra pictures from `content`. |
| … is not supported yet | Save the picture as TIFF, PNG or JPEG and upload that instead. |
| content/whatiiif.toml: … | Fix the setting it names; the message says how. |

If nothing runs at all after you upload, check that the picture went into the **content** folder.

## Large pictures

Pictures over 25 MB cannot be uploaded in the browser, so use Git on your computer instead. This template already
sends pictures through [Git LFS](https://git-lfs.com), which handles files over GitHub's 100 MB limit:

1. Install [Git LFS](https://git-lfs.com) and run `git lfs install` once.
2. Clone your repository, copy the picture into `content/`, then commit and push.

Free GitHub accounts include 10 GiB of LFS storage and 10 GiB of downloads a month; each rebuild downloads the
picture once.

## Keeping up to date

When this template improves, an **Update** workflow opens a pull request in your repository: merge it to update.
To let it do that, turn on **Settings → Actions → General → Allow GitHub Actions to create and approve pull
requests**. It never touches your `content` folder.

---

Working on whatiiif itself? See [DEVELOPING.md](DEVELOPING.md). MIT licence © g.j.hilton.
