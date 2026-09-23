# Little pic, big diff

Static public image gallery (tabs = categories) with multi-select ZIP download, plus a Python
generator that keeps the gallery's JSONC file and thumbnails in step with the image
folders. `site/` is the whole website; everything else is tooling.

## Files
- `generate.py` — scans `site/images/<category folder>/`, updates `site/gallery.jsonc`, writes
  `site/thumbs/`. Needs Pillow (`requirements.txt`, venv at
  `%USERPROFILE%\venvs\little-pic-big-diff`).
- `prepare.bat` — runs `generate.py`. Not scheduled in `runner`; run it after adding/removing images.
- `run.bat` — `prepare.bat` then `serve.bat`. Those two never call each other.
- `venv.bat` — own copy of `../common/venv.bat` (creates/updates the venv, sets `PY`). This app
  must stay portable: nothing in this folder may reference anything outside it.
- `serve.bat` — local preview at http://localhost:8137 (opening `index.html` as a file does not
  work: the browser refuses to `fetch` `gallery.jsonc` from a `file://` address).
- `assets/` — logo source files (`logo-small.png`, `logo-large.png`); not part of the site.
  `site/logo-small.png` is a copy of the small one, shown at the top left instead of the site
  title (`.top .logo`, sized to the tab strip). Copy again after changing the source.
- `site/index.html`, `site/app.js`, `site/style.css` — the app. React 18 + htm + JSZip come from
  CDNs (cdnjs, jsdelivr), GoatCounter's `count.js` from gc.zgo.at only when counting is on; there
  is no build step and no `node_modules`.
- `site/gallery.jsonc` — the data file the site reads. Created by the first `generate.py` run.
- `site/gallery+.jsonc` — optional. If it exists, it is used **instead of** `gallery.jsonc` by
  both `generate.py` (read and rewritten, `gallery.jsonc` is then left alone) and the site (the
  page tries `gallery+.jsonc` first, then `gallery.jsonc`). Same format. To switch to it, copy
  `gallery.jsonc` to `gallery+.jsonc` (or create an empty one and run `prepare.bat`).
- `site/images/`, `site/thumbs/` — git-ignored in the root `.gitignore` (binary bulk). `thumbs`
  is disposable: delete it and run `generate.py`.

## Workflow
1. Put images in `site/images/<folder>/` (one folder = one tab; jpg, jpeg, png, webp, gif).
2. `prepare.bat`.
3. Optionally edit `site/gallery.jsonc` (order, titles, tags, tab titles/descriptions).
4. `serve.bat` to look at the result (`run.bat` = steps 2 and 4 in one go).

## gallery.jsonc rules
`generate.py` rewrites the whole file in a fixed layout: one image per line, every line ending
with a comma (trailing commas are allowed, so lines can be moved without fixing commas).
- **Preserved**: the `site` block, the order of categories, every category field (`title`,
  `description`, …), the order of images, and every image field it does not own (`title`, `tags`,
  `added`, any extra key).
- **Owned by the script** (overwritten): `w`, `h`, `bytes` (after the ratio fix, see below).
- **New folder** → category appended at the end, title made from the folder name.
- **New file** → line added at the bottom of its category (`"addNewImages": "top"` in `site` puts
  new lines at the top instead), title made from the file name, `added` = today. On the very first
  run (no `gallery.jsonc` yet) `added` is the file's modified date, so that not everything is "new".
- **File gone** → its line becomes `// [deleted] {...},` in place. When the file comes back, the
  line is uncommented with its title/tags intact. Delete the line by hand to forget the image.
- **`// {...},` without `[deleted]`** = hidden by hand. The script keeps the line as it is and
  never re-adds the file. An unreadable image is hidden this way by the script (it prints why).
- Other comments are **not** preserved (only the three header lines are written back).
- Folders named `demo-*` are sample content: the site hides them as soon as any other category
  has images (they stay in the file and in `thumbs`).
- **`"hidden": true`** on a category block hides its tab (the script keeps the field like any
  other category field; the images and thumbnails stay). Remove the field to show it again.
- A category with no visible images gets no tab. A removed folder keeps its category block with
  all lines `[deleted]`; delete the block by hand to remove it.
- Invalid JSON → the script prints the line number and changes nothing.
- The file is written with LF line endings and only when its content changed.

`site` settings: `title`, `description` (shown above the grid when the category has none),
`addNewImages` (`"bottom"`/`"top"`), `thumbSize` (long side in px, default 420 ≈ 2× the
displayed size; changing it does not resize existing files: delete `thumbs`), `goatcounter`
(see Usage counting; `""` = off).

Thumbnails are WebP, named `<original file name>.webp` (so `a.jpg` and `a.png` cannot collide),
remade when missing or older than the source; thumbnails without a visible image are removed.
There are no intermediate previews: the lightbox shows the original file.

## Ratio rule (1283:1761)
Images are expected to be 1283×1761 (short side × long side, either orientation); every image
must have that ratio within 0.5 %. Every card shows a 306:420 box (portrait, w < h) or 420:306
(landscape), which is the same ratio to within 0.001 %. `generate.py` (`RATIO`,
`RATIO_TOLERANCE` = 0.5 %) enforces it:
- Image within 0.5 % of the ratio but not exact → **the original file is resized in place** to the
  exact ratio, keeping its long side (JPEG re-saved at quality 95, 4:4:4; WebP quality 95; PNG
  lossless; ICC profile kept; EXIF rotation baked in, EXIF dropped). Printed as
  `Resized to exact ratio`. GIFs and animated files are never touched.
- Image more than 0.5 % off → the original is left alone, and printed as `INCORRECT RATIO` on every
  run until it is fixed at the source.
- Thumbnails are always exactly `thumbSize` on the long side and the ratio's short side
  (420 → 306×420), stretched if needed; an off-ratio image's thumbnail carries a big red
  "Incorrect Ratio" label on white in the middle (Arial Bold, or Pillow's default font).
`tags` are private notes for now: the site does not show or use them.

## Site behaviour
- **Grid** ("packed blocks"): CSS grid with `grid-auto-flow: dense`. Columns are `--u` (10.75 px)
  wide with a `--g` (6 px) gap: portrait (w < h) spans 12, landscape 16. Every card has a fixed
  picture box, 306:420 for portraits and 420:306 for landscapes (inline `aspect-ratio`), which
  the thumbnail fills exactly (see Ratio rule), so all cards of one orientation have the same
  height and rows line up. Rows are `--r` (3 px) with no row gap; each card keeps its natural height
  (`align-self: start`) and `useRowSpan` in `app.js` sets its `grid-row: span N` from its measured
  height + `margin-bottom` (the vertical gap) with a `ResizeObserver`, so the cell always fits
  the card. Each card is a white rounded card with an 8 px frame on three sides; the footer is
  one fixed 26 px `<label>` (check ring at the left, bold title between long dashes, centred;
  clicking anywhere on it selects, clicking the picture opens the lightbox) with no margin
  below it. Accepted costs: small holes, and the browser moves later images up into gaps, so the
  visual order can differ from the JSON order (the lightbox follows the JSON order). At ≤ 520 px
  the grid is exactly 40 columns wide (landscape + 2 portraits, or 3 portraits) with a 5 px frame
  and a 22 px footer.
- **"New"** is per visitor: an image is new when its `added` date is later than the visitor's
  previous visit (`localStorage` `lpbd-last-visit`, fixed for the tab's lifetime in
  `sessionStorage` so a reload keeps the badges). A first visit shows no badges.
- **Tabs** (`Tabs` in `app.js`): the strip scrolls sideways when it does not fit, with its
  scrollbar hidden, so a ≪ or ≫ is overlaid on the edge behind which more tabs hide (checked on
  scroll and on resize); tapping it scrolls 70 % of the strip's width that way. The active tab
  is scrolled into view when it changes.
- **Selection** is kept across tabs and stored in `localStorage` (`lpbd-selection`, ids are
  `folder/file`); ids that no longer exist are dropped at load. Everything sits in the toolbar
  under the tabs: the tab's description at the left, at the right "x images selected (n in other
  tabs) · size" (or the download progress, or a red failure with a Dismiss button among the
  buttons) and then the buttons; on phones the buttons come first and the status text goes on
  a line under them. The buttons: Select all / Deselect all (this tab) and the blue Download
  all (this tab) when nothing is selected; Clear, Select all / Deselect all and the blue
  Download (the whole selection, all tabs) when something is. There is no other bar.
- **Download**: one image → direct download of the original. Several → originals are fetched
  (4 at once) and zipped in the browser with JSZip, uncompressed (`STORE`); paths inside the ZIP
  are `folder/file`, or just `file` when all come from one folder. Above 500 MB the visitor is
  asked to confirm, because the ZIP is built in memory. This needs same-origin images (true on
  GitHub Pages). Progress ("Fetching 3 of 10", "Zipping 40%") shows in the toolbar.
- **Addresses**: `#folder` = tab, `#folder/file` = that image open in the lightbox. Opening an
  image pushes a history entry (Back closes it); previous/next replace it.
- **Lightbox**: the original file with the thumbnail as placeholder, ←/→, Esc, Space = select,
  swipe on touch screens, neighbours are preloaded.
- Light theme only, by choice; dense spacing by choice.

## Usage counting (GoatCounter)
Off until `"goatcounter"` in the `site` block holds the site's count endpoint,
`https://<code>.goatcounter.com/count` (the `<code>` chosen when the GoatCounter site was created).
With it set, `app.js` loads `https://gc.zgo.at/count.js` after `gallery.jsonc` is read and sends
one hit per page view or action, without cookies or identifiers (the `track` object in `app.js`).
A GoatCounter hit is a *path* (what the dashboard counts and lists), a *title* (shown next to the
path, last one wins) and a *referrer* (listed under the path with its own counts):
- **Page views**: path `/#folder` when a tab is shown, `/#folder/file` when an image is opened
  (previous/next in the lightbox count too; closing it counts the tab again). Title = tab or
  image title.
- **Events** (GoatCounter "event" hits), title = image or tab title, details in the referrer:
  - `select/<folder>/<file>`, `unselect/<folder>/<file>` — referrer `card` or `lightbox`.
    `select-all/<folder>`, `unselect-all/<folder>` (the tab's button; not one hit per image).
    `clear` (the Clear button in the toolbar).
  - `download` — one hit per download, whether one file or a ZIP; the referrer is the list of
    image ids separated by `;` (cut at about 2000 characters, then ending in `;+N`). Sent only
    after the file or ZIP was handed to the browser, so a failed ZIP counts nothing. Per-image
    download totals are therefore not on the dashboard, only in the CSV export (which needs
    "Individual pageviews" on, see below).
  - Reserved, no UI yet: `upvote/…`, `downvote/…`, `report/…` (referrer = reason) via
    `track.vote(image, up)` and `track.report(image, reason)`.
- **Mark**: every path ends with `?w=<value>` when the page address has a `w` query item
  (`https://…/?w=asana#folder`, kept for the tab's lifetime since navigation only changes the hash),
  so the dashboard filter `w=asana` shows those hits. On localhost (`serve.bat`) hits are sent
  as well; when the address has no `w`, the page first adds `?w=asana` (`COUNT_LOCAL_W` in
  `app.js`) to it, visibly, and an address that already has one (`?w=test`) is left alone.
  Nothing else identifies the visitor. Visiting the site with `#toggle-goatcounter` switches counting off (and on again) for
  that browser. There is no consent banner: nothing is stored on the visitor's device for counting.
- Hits are sent one every 300 ms (GoatCounter refuses more than 4 per second from one address);
  hits still queued when the tab closes are lost.
- **GoatCounter settings that matter** (Settings → Data collection; verified in the source):
  - *Sessions* (on by default): every number on the dashboard, for pages and events alike, is
    then the number of **sessions** in which that path was hit, not the number of hits. A session
    is one browser (hash of address + browser, rotated daily) until it is idle for a while. So
    three downloads in one session count as one `download`, and only the first one's image list
    is counted in the referrer breakdown; selecting, unselecting and selecting an image again is
    one `select` and one `unselect`. With Sessions off every hit counts, and page views lose
    the "unique visitor" meaning. **Choice made: Sessions off** for this site, so every number
    on the dashboard is a plain count of hits (the dashboard still labels them "visits").
  - *Individual pageviews* (off by default): stores every hit as a row for the CSV export and
    the API. The dashboard does not need it; the image lists of every `download` are only
    retrievable with it on.
  - GoatCounter drops `ref`, `fbclid`, `mc_*` and `utm_*` query items from paths and keeps the
    rest, so the `?w=…` mark survives. Referrer text is kept as is, except that spaces in image
    ids come back as `%20`.

## Not done yet
- Deployment. Target is GitHub Pages, from a separate public repo whose clone lives outside
  OneDrive (the Apps repo is never pushed). GitHub limits: 100 MB per file, about 1 GB per site.
- Tag filter/search, thumbnail size slider, per-image credits: considered and declined for now.
