# Little pic, big diff

Static public image gallery (tabs = categories) with multi-select ZIP download, plus a Python
generator that keeps the gallery's JSONC file and thumbnails in step with the image
folders. `site/` is the whole website; everything else is tooling.

## Files
- `generate.py` — scans `site/images/<category folder>/`, updates `site/gallery.jsonc`, writes
  `site/thumbs/`. Needs Pillow (`requirements.txt`, venv at
  `%USERPROFILE%\venvs\little-pic-big-diff`).
- `run.bat` — runs `generate.py`. Not scheduled in `runner`; run it after adding/removing images.
- `venv.bat` — own copy of `../common/venv.bat` (creates/updates the venv, sets `PY`). This app
  must stay portable: nothing in this folder may reference anything outside it.
- `serve.bat` — local preview at http://localhost:8137 (opening `index.html` as a file does not
  work: the browser refuses to `fetch` `gallery.jsonc` from a `file://` address).
- `site/index.html`, `site/app.js`, `site/style.css` — the app. React 18 + htm + JSZip come from
  CDNs (cdnjs, jsdelivr); there is no build step and no `node_modules`.
- `site/gallery.jsonc` — the data file the site reads. Created by the first `generate.py` run.
- `site/gallery+.jsonc` — optional. If it exists, it is used **instead of** `gallery.jsonc` by
  both `generate.py` (read and rewritten, `gallery.jsonc` is then left alone) and the site (the
  page tries `gallery+.jsonc` first, then `gallery.jsonc`). Same format. To switch to it, copy
  `gallery.jsonc` to `gallery+.jsonc` (or create an empty one and run `run.bat`).
- `site/images/`, `site/thumbs/` — git-ignored in the root `.gitignore` (binary bulk). `thumbs`
  is disposable: delete it and run `generate.py`.

## Workflow
1. Put images in `site/images/<folder>/` (one folder = one tab; jpg, jpeg, png, webp, gif).
2. `run.bat`.
3. Optionally edit `site/gallery.jsonc` (order, titles, tags, tab titles/descriptions).
4. `serve.bat` to look at the result.

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
- A category with no visible images gets no tab. A removed folder keeps its category block with
  all lines `[deleted]`; delete the block by hand to remove it.
- Invalid JSON → the script prints the line number and changes nothing.
- The file is written with LF line endings and only when its content changed.

`site` settings: `title`, `description` (shown above the grid when the category has none),
`addNewImages` (`"bottom"`/`"top"`), `thumbSize` (long side in px, default 420 ≈ 2× the
displayed size). Changing it does not resize existing files: delete `thumbs`.

Thumbnails are WebP, named `<original file name>.webp` (so `a.jpg` and `a.png` cannot collide),
remade when missing or older than the source; thumbnails without a visible image are removed.
There are no intermediate previews: the lightbox shows the original file.

## Ratio rule (306:420)
Every card shows a 306:420 box (portrait, w < h) or 420:306 (landscape). `generate.py` (`RATIO`,
`RATIO_TOLERANCE` = 2 %) enforces it:
- Image within 2 % of the ratio but not exact → **the original file is resized in place** to the
  exact ratio, keeping its long side (JPEG re-saved at quality 95, 4:4:4; WebP quality 95; PNG
  lossless; ICC profile kept; EXIF rotation baked in, EXIF dropped). Printed as
  `Resized to exact ratio`. GIFs and animated files are never touched.
- Image more than 2 % off → the original is left alone, and printed as `INCORRECT RATIO` on every
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
- **Selection** is kept across tabs and stored in `localStorage` (`lpbd-selection`, ids are
  `folder/file`); ids that no longer exist are dropped at load. Per tab: Select all / Deselect all,
  Download all.
- **Download**: one image → direct download of the original. Several → originals are fetched
  (4 at once) and zipped in the browser with JSZip, uncompressed (`STORE`); paths inside the ZIP
  are `folder/file`, or just `file` when all come from one folder. Above 500 MB the visitor is
  asked to confirm, because the ZIP is built in memory. This needs same-origin images (true on
  GitHub Pages).
- **Addresses**: `#folder` = tab, `#folder/file` = that image open in the lightbox. Opening an
  image pushes a history entry (Back closes it); previous/next replace it.
- **Lightbox**: the original file with the thumbnail as placeholder, ←/→, Esc, Space = select,
  swipe on touch screens, neighbours are preloaded.
- Light theme only, by choice; dense spacing by choice.

## Not done yet
- Deployment. Target is GitHub Pages, from a separate public repo whose clone lives outside
  OneDrive (the Apps repo is never pushed). GitHub limits: 100 MB per file, about 1 GB per site.
- Tag filter/search, thumbnail size slider, per-image credits: considered and declined for now.
