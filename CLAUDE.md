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
- `assets/` — logo source files (`logo-small-borderless-transparent.png` and other versions,
  `logo-large.png`); not part of the site. `site/logo-small-borderless-transparent.png` is a
  copy of the transparent one, shown at the top left instead of the site title (`.top .logo`,
  scaled to the tab strip's 40 px with nothing around it). Copy again after changing the source.
- `site/index.html`, `site/app.js`, `site/style.css` — the app. React 18 + htm + JSZip come from
  CDNs (cdnjs, jsdelivr), GoatCounter's `count.js` from gc.zgo.at only when counting is on; there
  is no build step and no `node_modules`.
- `site/gallery.jsonc` — the data file the site reads. Created by the first `generate.py` run.
- `site/gallery+.jsonc` — optional. If it exists, it is used **instead of** `gallery.jsonc` by
  both `generate.py` (read and rewritten, `gallery.jsonc` is then left alone) and the site (the
  page tries `gallery+.jsonc` first, then `gallery.jsonc`). Same format. To switch to it, copy
  `gallery.jsonc` to `gallery+.jsonc` (or create an empty one and run `prepare.bat`).
- `site/images/`, `site/thumbs/` — tracked in git like the rest (the root `.gitignore` rule that
  excluded them was removed on purpose). `thumbs` is disposable: delete it and run `generate.py`.

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
- Folders named `z-demo-*` are sample content: the site hides them as soon as any other category
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
(see Usage counting; `""` = off), `showClearButton` and `showDownloadAllButton` (the toolbar's
Clear and Download all buttons, see Site behavior; both `false` by default, so hidden),
`rememberSelection` (`true`: the selection survives a reload, see Site behavior; `false` by
default: a reload unselects everything), `showImageCounts` (`true`: the number of images
after each tab title in the header; `false` by default), `maxDownloadMB` (the selection /
download cap, see Download; 100 by default).

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

## Site behavior
- **Grid** ("packed blocks"): CSS grid with `grid-auto-flow: dense`. Columns are `--u` (10.75 px)
  wide with a `--g` (6 px) gap: portrait (w < h) spans 12, landscape 16. Every card has a fixed
  picture box, 306:420 for portraits and 420:306 for landscapes (inline `aspect-ratio`), which
  the thumbnail fills exactly (see Ratio rule), so all cards of one orientation have the same
  height and rows line up. Rows are `--r` (3 px) with no row gap; each card keeps its natural height
  (`align-self: start`) and `useRowSpan` in `app.js` sets its `grid-row: span N` from its measured
  height + `margin-bottom` (the vertical gap) with a `ResizeObserver`, so the cell always fits
  the card. Each card is a white rounded card with an 8 px frame on three sides (the frame turns
  the accent blue, shadowless, with a white title, when the image is selected); the footer is
  one fixed 26 px `<label>` (check ring at the left, bold title between long dashes, centered;
  clicking anywhere on it selects, clicking the picture opens the lightbox) with no margin
  below it. Accepted costs: small holes, and the browser moves later images up into gaps, so the
  visual order can differ from the JSON order (the lightbox follows the JSON order). At ≤ 520 px
  the grid is exactly 40 columns wide (landscape + 2 portraits, or 3 portraits) with a 5 px frame
  and a 32 px footer (taller than on desktop: a finger-sized target for selecting).
- **"New"** is per visitor: an image is new when its `added` date is later than the visitor's
  previous visit (`localStorage` `lpbd-last-visit`, fixed for the tab's lifetime in
  `sessionStorage` so a reload keeps the badges). A first visit shows no badges.
- **Tabs** (`Tabs` in `app.js`): the strip scrolls sideways when it does not fit, with its
  scrollbar hidden, so a ≪ or ≫ is overlaid on the edge behind which more tabs hide (checked on
  scroll and on resize); tapping it scrolls 70 % of the strip's width that way. The active tab
  is scrolled to the middle of the strip when it changes (as far as the ends allow), so it
  never sits under a marker. A clicked tab is blurred at once, so no focus ring lingers on it
  after an arrow key or a swipe moves on; hover styles apply only under `(hover: hover)`, so a
  tap on a touch screen leaves none stuck. ← / → (with the lightbox closed) and, on touch
  screens, a sideways swipe anywhere under the header (`main` fills the rest of the screen,
  blank space included) go to the previous/next tab, with no wrap-around at the ends
  (`switchTab`; `useSwipe` is the swipe recognizer shared with the lightbox:
  the first 8 px of a touch move decide between sideways and vertical, a second finger drops
  the swipe, and it counts when it passed a quarter of the width or was a quick flick,
  > 0.5 px/ms over > 20 px). `main` follows the finger and, when the swipe counts (or on a
  key), glides off the screen (`glide`, 250 ms, none under `prefers-reduced-motion`); the new
  tab then renders in its place without animation (nothing is pre-rendered), `main` being put
  back in a layout effect before that paints. Otherwise `main` springs back.
- **Selection** is kept across tabs. With `rememberSelection` on it is also stored in
  `localStorage` (`lpbd-selection`, ids are `folder/file`) and ids that no longer exist are
  dropped at load; with it off (the default) a reload starts with nothing selected, and any
  stored selection is removed. Everything sits in the toolbar
  under the tabs (on phones, ≤ 520 px, the controls are instead a bar fixed at the bottom of
  the screen, rendered after `main` because `main` is what the tab swipe moves and a
  transformed ancestor would carry a fixed bar along; `useMediaQuery(PHONE_QUERY)`, the
  description staying at the top): the tab's description at the left; at the right a status block, "x images
  selected" over "(n in other tabs)" (or the download progress, or a red failure with a
  Dismiss button among the buttons), and then the buttons, always side by side (they wrap
  when the width runs out). The buttons, in order: Clear, the blue "Download <size>" (the
  whole selection, all tabs) or, when nothing is selected, the blue "Download all <size>"
  (this tab), then Select all / Deselect all (this tab; Deselect all as soon as one image of
  the tab is selected). Clear and Download all only exist
  when `showClearButton` / `showDownloadAllButton` in the `site` block are `true` (both
  are `false` by default). There is no other bar.
- **Download**: one image → direct download of the original. Several → originals are fetched
  (4 at once) and zipped in the browser with JSZip, uncompressed (`STORE`); paths inside the ZIP
  are `folder/file`, or just `file` when all come from one folder. Because the ZIP is built in
  memory, a download is capped at `maxDownloadMB` (`site` setting, 100 by default; the sum of
  the images' `bytes`). Selecting is never refused: while the selection is over the cap,
  "Selection is too large to download" shows in the status block in place of the count and
  the Download button is not shown (no Dismiss: it is a state, gone as soon as the selection
  fits again). Download all is not shown when the tab is over the cap. Other messages
  (a failed download) have a Dismiss button. This needs same-origin images (true on GitHub
  Pages). Progress ("Fetching 3 of 10", "Zipping 40%") shows in the toolbar.
- **Addresses**: `#folder` = tab, `#folder/file` = that image open in the lightbox. Opening an
  image pushes a history entry (Back closes it); previous/next replace it.
- **Lightbox**: the original file with the thumbnail as placeholder, ←/→, Esc, Space = select,
  "‹ Back" at the top left (closes it, like ✕ and Esc); the bar under the picture: title and
  facts, the blue Download (that one file), Select / ✓ Selected, ✕. On phones (≤ 520 px) it is
  a sheet instead: it rises from the bottom (`rise` animation), a downward swipe on the
  picture drags it along and, past a
  quarter of the height or with a flick, glides it out and closes it (else it springs back;
  `useSwipe`'s `dragY` / `endY`), and an icon-only ✕ at the top right of the picture replaces
  both "‹ Back" and the bar's ✕. When the picture's orientation is not the phone's (a
  landscape picture on a portrait phone, or the reverse), an icon-only ↺ left of the ✕ turns
  it to fill the screen, 90° left so that its bottom is on the right, and back (↻) on the
  next tap: the current slide gets the stage's size with width and
  height swapped and is rotated about its center; a new image or a turn of the phone puts it
  back, and the pinch maps its offsets into the turned picture's coordinates. Pinch zoom is elastic:
  two fingers scale the current picture around their midpoint (up to 6×) and pan it with the
  midpoint, and it springs back as soon as one finger lifts (the stage has `touch-action:
  none`, so the browser never zooms the page there). The page itself (header, `main`) has
  no pinch zoom (`touch-action: pan-y` / `pan-x pan-y`): a zoomed-in pan would otherwise be
  taken for a tab swipe.
  The stage is a strip of three slides (previous, current, next, so the neighbors are loaded
  ahead) that follows the finger sideways (`useSwipe`, see Tabs; a dropped swipe springs
  back, and a pinch zoom is left to the browser); on release it slides on to the neighbor when
  the swipe counts, else it springs back.
  Arrows and keys slide the same way (250 ms; none with `prefers-reduced-motion`). The image
  changes only once the slide has settled, and since that goes through the address hash (not
  immediate), the strip stays on the neighbor until the new image has rendered and is reset in
  a layout effect, before the paint: no frame of the old image in between.
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
  - `error/download` — a download that failed (a fetch or the ZIP), title `Error`, the message
    in the referrer. A gallery that fails to load cannot be reported: counting only starts
    once the data file, which holds the GoatCounter address, has loaded.
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
