# Little pic, big diff

Static public image gallery (tabs = categories) with multi-select ZIP download, plus a Python
generator that keeps the gallery's JSONC file and thumbnails in step with the image
folders. `site/` is the whole website; everything else is tooling.

## Files
- `generate.py` — scans `site/images/<category folder>/`, updates `site/gallery.jsonc`, writes
  `site/thumbs/`. Needs Pillow (`requirements.txt`, venv at
  `%USERPROFILE%\venvs\little-pic-big-diff`).
- `prepare.bat` — runs `generate.py`. Not scheduled in `runner`; run it after adding/removing images.
- `run.bat` — `copy.bat`, then `prepare.bat`, then `serve.bat`; stops when copy or prepare
  fails. Those three never call each other.
- `copy.bat` — this folder is the **template**: other copies of the app (each with its own
  images and `gallery+.jsonc`) run `copy.bat` (first step of their `run.bat`) to take the
  app from it (`%USERPROFILE%\OneDrive\Apps\little-pic-big-diff`), never its content. Copied,
  overwriting: the files at the top of the folder except `copy.bat` itself (a batch file
  overwritten while it runs can break), `assets\`, and `site\` except `site\images\`,
  `site\thumbs\`, `site\gallery.jsonc` and `site\gallery+.jsonc`. Nothing is deleted (no
  `/MIR`): files only in the copy stay. Run from the template it skips. Exits with 0 on
  success (robocopy's 1-7 are successes too), 1 on failure. Since it never copies itself, a
  change to `copy.bat` reaches the copies only by hand. It is the one file here that names a
  path outside the folder, on purpose.
- `venv.bat` — own copy of `../common/venv.bat` (creates/updates the venv, sets `PY`). This app
  must stay portable: nothing in this folder may reference anything outside it.
- `archived_mark.py` — writes `site/archived-mark.svg`, the "ARCHIVED" watermark tile behind
  archived content, and its size in `style.css` (`--archived-mark`): the word as vector
  outlines from Segoe UI Bold (font-independent, crisp at any zoom, one rasterization per
  tile) in lines running up at 45°, every line shifted by half a word period against its
  neighbors (brick pattern), `LINE_GAP` cap heights of clear space between lines (0.75). Such
  a lattice repeats in a square tile only when period / line spacing = 2n / k (n, k whole,
  same parity; the side is then k × period / √2): the script takes the smallest such ratio
  leaving at least `GAP` px between the words of a line, rounds the side to whole pixels and
  derives the rest from it, so the repeat is exact. Run it
  again after changing its settings (needs `fonttools`, not in `requirements.txt`; the SVG is
  tracked, so nothing needs to run on another PC).
- `serve.py` — the preview server: `http.server` with `Cache-Control: no-store` on every reply, so
  a phone on the LAN never shows stale code after an edit. Stdlib only.
- `serve.bat` — runs `serve.py` on port 8137 (opening `index.html` as a file does not
  work: the browser refuses to `fetch` `gallery.jsonc` from a `file://` address).
- `assets/` — logo source files (`logo-small-borderless-transparent.png` and other versions,
  `logo-large.png`) and the flyer deck (`Flyers - Placeholders.pptx`: two slides of PowerPoint's
  "Letter Paper" size, 7.5 × 10 in, which PowerPoint scales to the sheet when printing; four
  full-bleed frames each of 3.5 in × 4.804 in, exactly 1283:1761, at the page's corners,
  set by script to the EMU since PowerPoint's dialogs round); nothing here is served:
  a file gets out of this folder only by a copy into `site/` (`generate.py` for the deck, by
  hand for the logo). `site/logo-small-borderless-transparent.png` is a copy of the transparent
  one, shown at the top left instead of the site title (`.top .logo`, scaled to the tab strip's
  40 px with nothing around it). Copy again after changing the source.
- `icons.py` — cuts the megaphone-and-fist icon out of `assets/logo-large.png` (`SEARCH_BOX`,
  one color `INK`, opacity from darkness) and writes `site/favicon.ico` (16/32/48, on a white
  rounded square so it shows on a dark tab strip), `site/apple-touch-icon.png` (180, plain white
  square: iOS rounds it) and `site/icon.png` (512, the link-preview image). The outputs are
  tracked; run it again only after changing the logo (needs Pillow).
- `site/index.html`, `site/app.js`, `site/style.css` — the app. React 18 + htm + JSZip come from
  CDNs (cdnjs, jsdelivr), GoatCounter's `count.js` from gc.zgo.at only when counting is on; there
  is no build step and no `node_modules`. `app.js` ends by putting the parts other pages build
  on into `window.LPBD` (the site's initials) and mounts the gallery only when the page has a
  `#root`.
- `site/compose.html`, `site/compose.js` — the hidden compose page (see Compose page below).
  `compose.html` carries the same CDN tags as `index.html`, then `app.js` (which mounts nothing
  there: no `#root`), then `compose.js`, which takes what it needs from `window.LPBD` (`html`,
  `React`, `normalize`, `parseJsonc`, `urlPath`, the data file names, `Tile`, `Tabs`,
  `Lightbox`, `useRoute`, `downloadImages`, `saveAs`, `slug`, `formatBytes`, `plural`; add a
  piece there before using it) and mounts into `#compose`.
- `site/flyers-placeholders.pptx` — the deck the compose page fills in the browser. Its source
  is `assets/Flyers - Placeholders.pptx`, which is never served, so `generate.py` (`copy_deck`)
  copies it into `site/` when its bytes differ. The copy is tracked.
- `site/index.html` head: the lines between `<!-- generate.py: … -->` and `<!-- /generate.py -->`
  are rewritten by `generate.py` from the `site` block: `<title>`, `og:title`, and (when
  `description` is not empty) `description` / `og:description`, plus `og:type`, and (when
  `url` is set: `og:image` must be an absolute address) `og:url` and `og:image` = `icon.png`.
  Link previews (Signal, WhatsApp, …) read the raw HTML without running `app.js`, whose
  `document.title` only Chrome's tab shows. Keep the marker lines; without them the script
  prints a warning. The icon links under them (`favicon.ico`, `icon.png`,
  `apple-touch-icon.png`) are fixed.
- `site/gallery.jsonc` — the data file the site reads. Created by the first `generate.py` run.
- `site/gallery+.jsonc` — optional. If it exists, it is used **instead of** `gallery.jsonc` by
  both `generate.py` (read and rewritten, `gallery.jsonc` is then left alone) and the site (the
  page tries `gallery+.jsonc` first, then `gallery.jsonc`). Same format. To switch to it, copy
  `gallery.jsonc` to `gallery+.jsonc` (or create an empty one and run `prepare.bat`).
- `site/images/`, `site/thumbs/` — tracked in git like the rest (the root `.gitignore` rule that
  excluded them was removed on purpose). `thumbs` is disposable: delete it and run `generate.py`.

## Workflow
1. Put images in `site/images/<folder>/` (one folder = one tab; jpg, jpeg, png, webp, gif).
   Images in `site/images/<folder>/Archives/` (any case) belong to the same tab but are shown
   after the others, under an "Archived" rule, and the lightbox labels them Archived.
2. `prepare.bat`.
3. Optionally edit `site/gallery.jsonc` (order, titles, tags, tab titles/descriptions).
4. `serve.bat` to look at the result (`run.bat` = steps 2 and 4 in one go). The hidden compose
   page is at `/compose.html` (see below).

## gallery.jsonc rules
`generate.py` rewrites the whole file in a fixed layout: one image per line, every line ending
with a comma (trailing commas are allowed, so lines can be moved without fixing commas).
- **Preserved**: the `site` block, the order of categories, every category field (`title`,
  `description`, …), the order of images, and every image field it does not own (`title`, `tags`,
  `added`, any extra key).
- **Owned by the script** (overwritten): `w`, `h`, `bytes` (after the ratio fix, see below).
- **New folder** → category appended at the end, title made from the folder name.
- **Archives**: an image in the folder's `Archives` subfolder is listed as `"file":
  "Archives/<name>"` (the subfolder's name as on disk; `ARCHIVE_DIR`, matched in any case);
  its thumbnail is `thumbs/<folder>/Archives/<name>.webp`. Archived entries are always written
  after the others (`is_archived`), whatever their order in the file. A file moved between
  the folder and its `Archives` keeps its entry, title, tags and date (`Moved:` in the output)
  when exactly one file of that name appears on the other side.
- **New file** → line added at the bottom of its category (`"addNewImages": "top"` in `site` puts
  new lines at the top instead), title made from the file name, `added` = today. On the very first
  run (no `gallery.jsonc` yet) `added` is the file's modified date, so that not everything is "new".
- **File gone** → its line becomes `// [deleted] {...},` in place. When the file comes back, the
  line is uncommented with its title/tags intact. Delete the line by hand to forget the image.
- **`// {...},` without `[deleted]`** = hidden by hand. The script keeps the line as it is and
  never re-adds the file. An unreadable image is hidden this way by the script (it prints why).
- Other comments are **not** preserved (only the four header lines are written back).
- Folders named `z-demo-*` (`DEMO_PREFIX`) are sample content: as soon as any other folder in
  `site/images/` holds an image (an empty new folder does not count), the script **deletes the
  demo folders** from `site/images/`, drops their category blocks, removes their thumbnails as
  orphans and prints which (`Demo content removed`). The deletion comes after the duplicate
  name check, so a run stopped by it deletes nothing. Git still has them, to get them back.
  The site hides them too, as soon as any other category has images, for a hand-edited file.
- **`"hidden": true`** on a category block hides its tab (the script keeps the field like any
  other category field; the images and thumbnails stay). Remove the field to show it again.
- A category with no visible images gets no tab. A removed folder keeps its category block with
  all lines `[deleted]`; delete the block by hand to remove it.
- Invalid JSON → the script prints the line number and changes nothing.
- **Duplicate image names** (one name, in any case, both in a folder and in its `Archives`;
  they would clash in the ZIP and in the move detection) → the script prints every such pair
  in red, changes nothing and exits with code 1 (`run.bat` then does not start the server).
  Checked for all folders before any file is touched.
- The file is written with LF line endings and only when its content changed.

`site` settings: `title`, `description` (link-preview text and the page's
`description` meta tag only; never shown on the page, where only a category's own
`description` appears), `url` (the public address, `https://…`; `""` until deployed: link
previews then have no image),
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
  exact ratio, keeping its long side (JPEG re-saved at quality 89, 4:4:4; WebP quality 95; PNG
  lossless; ICC profile kept; EXIF rotation baked in, EXIF dropped). Printed as
  `Resized to exact ratio`. GIFs and animated files are never touched.
- Image more than 0.5 % off → the original is left alone, and printed as `INCORRECT RATIO` on every
  run until it is fixed at the source.
- Thumbnails are always exactly `thumbSize` on the long side and the ratio's short side
  (420 → 306×420), stretched if needed; an off-ratio image's thumbnail carries a big red
  "Incorrect Ratio" label on white in the middle (Arial Bold, or Pillow's default font).
`tags` are private notes for now: the site does not show or use them.

## Metadata rule
The originals are public downloads, so `generate.py` (`clean_metadata`, run on every visible
image before the ratio check) takes all metadata out of them: EXIF (GPS, camera, dates), XMP
(author names from editing apps), IPTC/Photoshop blocks, comments, PNG text chunks. It drops
only the blocks that hold it (`strip_jpeg`, `strip_png`, `strip_webp`), so **the picture is not
re-encoded** (pixels identical). Kept: the ICC profile and what decoding needs (JPEG APP0 JFIF,
APP14 Adobe; PNG critical chunks and those in `PNG_KEEP`). Printed as `Metadata removed`; a
clean file is left untouched (no rewrite, no new thumbnail).
- An image with an EXIF rotation (Orientation other than 1) is **re-saved turned upright**
  instead (like a ratio fix: JPEG quality 89 4:4:4, WebP 95, PNG lossless; ICC kept), which
  drops the metadata as well. Printed as `Rotated upright, metadata removed`.
- GIFs and animated files are left alone, metadata included.
- A file whose layout the strippers do not recognize is left alone.

## Site behavior
- **Archived images** (`archived` on the image, from the `Archives/` prefix of its file) come
  after the others in a tab, their thumbnails in gray (`filter: grayscale`; the lightbox shows
  the original in color): a second grid under a rule reading "Archived" (`.divider`; two
  grids because in one dense grid the archived cards would climb into holes above the rule).
  The lightbox runs through both in that order and shows the same "Archived" tag (`.archived-tag`,
  white on gray) to the right of the title, over a slide tiled with a faint diagonal "ARCHIVED"
  watermark (`--archived-mark`: `archived-mark.svg`, see `archived_mark.py`; also behind the
  grid's archived part, `.archive`: its rule, toolbar and grid, window edge to window edge,
  down to the bottom of `main`; the rule's row is pulled up by half its height so the line
  lies on the area's top edge and the watermark starts exactly at the line).
  Addresses keep the subfolder: `#folder/Archives/file` (`urlPath` encodes each segment).
- **Grid** ("packed blocks"): CSS grid with `grid-auto-flow: dense`. Columns are `--u` (10.75 px)
  wide with a `--g` (6 px) gap: portrait (w < h) spans 12, landscape 16. Every card has a fixed
  picture box, 306:420 for portraits and 420:306 for landscapes (inline `aspect-ratio`), which
  the thumbnail fills exactly (see Ratio rule), so all cards of one orientation have the same
  height and rows line up. Rows are `--r` (3 px) with no row gap; each card keeps its natural height
  (`align-self: start`) and `useRowSpan` in `app.js` sets its `grid-row: span N` from its measured
  height + `margin-bottom` (the vertical gap) with a `ResizeObserver`, so the cell always fits
  the card. Each card is a white rounded card with an 8 px frame on three sides (the frame turns
  the accent blue, shadowless, with a white title, when the image is selected); the footer is
  one fixed 36 px `<label>` (9 px above and below the check ring) (check ring at the left, bold title between long dashes, centered;
  clicking anywhere on it selects, clicking the picture opens the lightbox) with no margin
  below it. Accepted costs: small holes, and the browser moves later images up into gaps, so the
  visual order can differ from the JSON order (the lightbox follows the JSON order). At ≤ 520 px
  the grid is exactly 40 columns wide (landscape + 2 portraits, or 3 portraits) with a 5 px frame
  and a 32 px footer (a finger-sized target for selecting).
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
  (`useTabSwitch`, a hook shared with the compose page, which gives the page `main`'s ref and
  swipe handlers, the toolbar's ref and the ‹ › buttons; `useSwipe` is the swipe recognizer
  shared with the lightbox; its `ref` adds a
  native non-passive touchmove listener that decides the axis itself (it runs before React's
  handler) and prevents the default once the move is ours, so the browser runs no gesture of
  its own on it, not even a vertical fling from a slightly diagonal drag, whose momentum would
  swallow the next tap:
  the first real touch move decides between sideways and vertical (the only move whose default
  can still be prevented before Chrome runs a scroll gesture), a second finger drops
  the swipe, and it counts when it passed a quarter of the width or was a quick flick,
  > 0.5 px/ms over > 20 px). `main` follows the finger and, when the swipe counts (or on a
  key), glides off the screen (`glide`, 150 ms ease-out, `TAB_MS`; the lightbox's glides take
  250 ms; the system's reduced-motion setting is not honored, by choice); the new
  tab then renders in its place without animation (nothing is pre-rendered), `main` being put
  back in a layout effect before that paints. Otherwise `main` springs back. The tab's
  toolbar (see Selection) stays in place throughout: it is moved the opposite way to `main`
  (it stays inside `main` so that it still scrolls away at the archived area), and a swipe
  that starts on it is ignored (`allowed(event)`).
  A ‹ / › button at the window's left/right edge, mid-height (the lightbox's `.nav` style,
  `.tab-nav`: `position: fixed`, rendered after `main` for the reason above), does the same as
  ← / →; there is none at the first/last tab, none while the lightbox is open, and none on
  phones (the `.nav` rule hides them there, like the lightbox's; the swipe does it).
- **Selection** is kept across tabs. With `rememberSelection` on it is also stored in
  `localStorage` (`lpbd-selection`, ids are `folder/file`) and ids that no longer exist are
  dropped at load; with it off (the default) a reload starts with nothing selected, and any
  stored selection is removed. Everything sits in the toolbar
  under the tabs, on every screen size (sticky under the header while something is selected,
  `.toolbar.sticky`, within `.current`, the toolbar and the current grid, so it scrolls away
  when the archived area reaches it; on phones, ≤ 520 px, the description takes a line of its
  own above the controls): the tab's description at the left; at the right a status block, "x images
  selected" over "(n in other tabs)" (or the download progress, or a red failure with a
  Dismiss button among the buttons), and then the buttons, always side by side (they wrap
  when the width runs out). The buttons, in order: Clear, the blue "Download <size>" (the
  whole selection, all tabs) or, when nothing is selected, the blue "Download all <size>"
  (this tab), then Select all / Deselect all (Select all selects the tab's current images;
  Deselect all, shown as soon as one of them is selected, deselects the whole tab, archives
  included). The archived part has its own "Select all archives" / "Deselect all archives"
  in a toolbar of its own under the "Archived" rule, at the right like the tab's, acting on
  the archived images only. Clear and Download all only exist
  when `showClearButton` / `showDownloadAllButton` in the `site` block are `true` (both
  are `false` by default). There is no other bar.
- **Download**: one image → direct download of the original. Several → originals are fetched
  (4 at once) and zipped in the browser with JSZip, uncompressed (`STORE`); paths inside the ZIP
  are `folder/file`, or just `file` when all come from one folder, with the `Archives` subfolder
  flattened into its parent (an archived file that shares its name with a current one of the
  same folder gets " (archived)" before its extension); a single archived file downloads under
  its bare name too. Because the ZIP is built in
  memory, a download is capped at `maxDownloadMB` (`site` setting, 100 by default; the sum of
  the images' `bytes`). Selecting is never refused: while the selection is over the cap,
  "Selection is too large to download" shows in the status block in place of the count and
  the Download button is not shown (no Dismiss: it is a state, gone as soon as the selection
  fits again). Download all is not shown when the tab is over the cap. Other messages
  (a failed download) have a Dismiss button. This needs same-origin images (true on GitHub
  Pages). Progress ("Fetching 3 of 10", "Zipping 40%") shows in the toolbar.
- **Addresses**: `#folder` = tab, `#folder/file` = that image open in the lightbox. Opening an
  image pushes a history entry (Back closes it); previous/next replace it. Closing (✕, Esc,
  Back button, swipe down) replaces that entry with the tab instead of popping it: a pop lands
  some time later on phones and would meanwhile undo a tap on another image or a tab swipe.
  The tab entry is thus there twice, so leaving the site takes one more Back press.
- **Lightbox**: the original file with the thumbnail as placeholder, ←/→, Esc, Space = select,
  "‹ Back" at the top left (closes it, like ✕ and Esc). While it is open the page behind is
  locked in place (`body.locked`: `position: fixed` with the scroll offset kept as a negative
  `top` and restored on close, since `overflow: hidden` alone does not stop iOS Safari from
  scrolling under a touch drag; touch moves on the stage are also blocked with a non-passive
  listener, React's own being passive), so no drag leaks into a page scroll whose momentum
  would swallow the next taps. The bar under the picture: title and
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
  Arrows and keys slide the same way (250 ms ease-out). The image
  changes only once the slide has settled, and since that goes through the address hash (not
  immediate), the strip stays on the neighbor until the new image has rendered and is reset in
  a layout effect, before the paint: no frame of the old image in between.
- Light theme only, by choice; dense spacing by choice.

## Compose page
`site/compose.html` (`/compose.html`) is a hidden page: nothing on the site links to it and it
carries `<meta name="robots" content="noindex">`. It exists to make flyers: it shows the same
tabs and images as the gallery (the archived ones under their "Archived" rule, without the
gallery's select-all toolbar; the watermark and gray thumbnails come with the `.archive`
section), two of them are picked **in the order they are clicked** (the `1` / `2` disc on the card is `Tile`'s
`order`, a `.badge.order`, which takes the place of the "new" badge there), and the deck
`site/flyers-placeholders.pptx` is filled with them and downloaded:

- **Picking**: `picks` is an array, so its order is the pick order. With both taken a third click
  is refused and a hint shows in the bar for a few seconds (React puts the checkbox back by
  itself); clicking a pick again, its ✕ in the bar or Select in the lightbox gives it up. The
  picks are **not** remembered across reloads. The page is not counted: it never calls
  `track.start`, and `track` drops every hit until started (the Download button of its lightbox
  goes through `downloadImages`, which would otherwise count). It has the lightbox (Space =
  pick) and the gallery's tab switching (← / →, swipe, ‹ › buttons: `useTabSwitch`, see Tabs
  under Site behavior).
- **The toolbar**: the controls sit in the tab's toolbar under the header (`.toolbar`, sticky
  there while a picture is picked, `.sticky`, as the gallery's is while something is selected;
  it moves with `main` on a tab switch like the gallery's). At the left `.slots`: a round `?`
  button (`.help`, blue while on) that shows the instructions ("Pick two pictures, in order:
  the first goes on the front of the flyers, the second on the back") on a line of their own
  under the controls, then the two slots (`.slot`: the number, 1 the front and 2 the back, and
  the picture at its own orientation with a ✕, or "Pick a picture"; no title, the card has it;
  the title is the slot's tooltip). At the right the status (the hint, or a red failure with a
  Dismiss button) and the blue `Compose` button, enabled only with both picks, which opens the
  preview.
- **The preview** (`.preview`, fixed over the page like the lightbox, z-index 20): the two
  filled pages side by side (stacked on phones), "Front" and "Back" with the picture's title
  under each, drawn from the deck's own geometry (`deckGeometry`: the page size from
  `ppt/presentation.xml` and every `<p:pic>` frame of each slide, in EMU, as percentages of
  the page) with the thumbnails, a landscape picture turned clockwise as in the deck
  (`img.turned`), and the page's center cross dashed for the cut. Its bar: the deck's name,
  the status (progress such as "Placed <title> on the front", or a failure), the blue
  **Download PDF** and **Download PowerPoint** buttons, **Print…** and ✕. Esc closes it too;
  it is not in the address, so Back does not; it closes by itself when a pick is given up.
  The three outputs share the deck's geometry (`deckGeometry`), so they place the pictures
  identically:
  - **PowerPoint**: `buildDeck`, which fetches the deck again (a filled one cannot be filled
    twice). Named `"<title1> + <title2>.pptx"` (`deckName`; characters Windows and macOS refuse
    are dropped).
  - **PDF**: `buildPdf`, written by hand, no library: two pages of the deck's page size
    (`MediaBox`, EMU / 12700 = points), one image object per page drawn into its four frames
    with a `cm` matrix (the landscape turn is the matrix `0 -h w 0 x y+h`), and the center
    cross as a dashed gray hairline. A JPEG is embedded byte for byte (`DCTDecode`; its color
    space from the SOF header's component count, `jpegComponents`); another format is drawn on
    a canvas and stored lossless (`FlateDecode`, deflated with the browser's
    `CompressionStream`), or as a JPEG (quality 0.92) in a browser without it. Same name,
    `.pdf`.
  - **Print…**: `openPrintPage` opens a new tab (blocked pop-ups are reported as a failure) with
    the two pages in HTML at the deck's page size (`@page { size; margin: 0 }`, the frames in
    inches, the originals in them, `img.turned` as in the preview, the cut cross dashed), gray
    around them on screen, and a Print… button with a hint (paper size or "fit to page",
    margins none) that printing hides. The visitor prints or saves as PDF from the browser.
- **Filling the deck** (`buildDeck` in `compose.js`): the file is fetched and opened with JSZip.
  The deck has two slides of 7.5 × 10 in (PowerPoint's "Letter Paper" preset, scaled to the
  sheet when printing), each with the same picture in **four portrait frames**
  (a quarter page each, `<p:pic>` with `<a:stretch><a:fillRect/>`): the first pick goes on the
  first slide, the second on the second. The pictures are put in **as they are**, never
  re-encoded (they are print files): one media part per slide, `ppt/media/flyer<n>.<ext>`, that
  every picture relationship of `slide<n>.xml.rels` is pointed at (`pointedAt`); the template's
  own parts (`image1-4.jpg`, `image5-8.png`) are removed, and `[Content_Types].xml` gets a
  `Default` for the extension when it has none (`typed`; jpg, jpeg and png are declared, gif is
  added). Only JPEG, PNG and GIF go in as they are (`EMBED`); a WebP is drawn on a canvas and
  encoded as a JPEG (quality 0.92) first, since PowerPoint's WebP support is unreliable. The
  frames have **exactly the gallery's ratio** (1283:1761, `RATIO`; 3.5 in × 4.804 in, full bleed
  at the page's corners with a 0.5 in gutter between the columns and 0.39 in between the rows),
  so a gallery image fills its frame with nothing cut, shrunk or stretched. An image off that
  ratio by more than `RATIO_TOLERANCE` (0.1 %; `generate.py` flags those as INCORRECT RATIO but
  still serves them) **cannot be picked**: the click is refused with a hint in the bar (`fits`,
  from the image's `w` × `h` in `gallery.jsonc`). A **landscape** picture is turned 90° in the
  slide's XML (`turned`, on every `<p:pic>` block): its `<a:xfrm>` gets the frame's size with
  width and height swapped, offset so the center stays, and a `rot`, so the visible footprint
  is still the frame and nothing of the picture is lost. It turns **clockwise**
  (`rot="5400000"`), its top to the right, the way a right hand turns the sheet (the lightbox's
  ↺ turns the other way, by choice). The two slides are the **front and back of one sheet**,
  read by flipping it **left to right**, and clockwise on both sides is right when the sheet is
  printed the same way: turned over on its **long edge** (the printer's default duplex) unless
  **both sides are landscape**, then on its **short edge** (re-fed by hand, flipped over its
  short edge). Printed on the long edge, a landscape back behind a landscape front would come
  out upside down. The XML is edited with regular expressions, not a DOM, so the
  XML declaration and namespaces come through untouched; a deck whose slides have no picture
  frame or picture relationship makes it fail with a message. The result is packed with the
  XML parts deflated (JSZip keeps their compression) and the pictures stored as they are, and
  handed to the browser through `LPBD.saveAs` as `"<title1> + <title2>.pptx"` (characters
  Windows and macOS refuse are dropped). `docProps/thumbnail.jpeg` is left as it is.
- The page title is `Compose – <site title>`, or `<image title> – Compose` in the lightbox; the
  page follows the same `#folder` / `#folder/file` addresses as the gallery.
- `normalize(raw, "")`: the page passes an empty "new since" date, so nothing is marked new and
  no visit is recorded for the gallery (`previousVisit` runs only as the default argument).

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
    `select-all/<folder>`, `unselect-all/<folder>` (the tab's button; not one hit per image);
    `select-all/<folder>/archived`, `unselect-all/<folder>/archived` (the archived part's).
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
  (`https://…/?w=myself#folder`, kept for the tab's lifetime since navigation only changes the hash),
  so the dashboard filter `w=myself` shows those hits. On localhost (`serve.bat`) hits are sent
  as well; when the address has no `w`, the page first adds `?w=myself` (`COUNT_LOCAL_W` in
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
