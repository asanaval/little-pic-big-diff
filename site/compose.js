// The compose page: site/compose.html, nothing on the site links to it. It shows the same
// categories and images as the gallery (archived ones under their rule), of which two can be picked
// — in the order they are clicked — and placed in the flyer deck (site/flyers-placeholders.pptx,
// copied there from the assets folder by generate.py), which is then downloaded.
//
// Loaded after app.js, which puts the parts both pages share on window.LPBD and, finding no
// #root on this page, mounts nothing. Nothing here is counted: the page never starts `track`,
// so the hits app.js's downloadImages sends are dropped.
(() => {
  const { html, React, normalize, parseJsonc, GALLERY_FILE, OVERRIDE_FILE, Tile, Tabs, Lightbox, useRoute, useTabSwitch, downloadImages, saveAs, slug } = window.LPBD;
  const { useState, useEffect, useCallback, useRef } = React;

  // ---------- the deck ----------

  // Two slides of PowerPoint's "Letter Paper" size (7.5 × 10 in, scaled to the sheet when
  // printed), each holding the same picture in four portrait frames (a quarter
  // page each): the first pick goes on the first slide, the second on the second. The pictures
  // are put in as they are, not re-encoded (these are print files), one media part per slide
  // that all four frames point to: the slide's relationships are all pointed at it and the
  // template's own pictures are removed. The frames are exactly the gallery's ratio (RATIO,
  // 1283:1761), so a picture of that ratio fills its frame with nothing cut or stretched; a
  // picture off it (generate.py flags those but still serves them) cannot be picked. In the
  // slide's XML a landscape picture is turned 90°: the frame's shape is set to the picture's
  // orientation, with the frame's center, and rotated back into the frame with `rot`. It turns
  // clockwise, its top to the right, as a right hand turns the sheet. The two slides are the
  // front and the back of one sheet, and that holds for both when the sheet is flipped left to
  // right as it is read, and printed the same way: turned over on its long edge (the printer's
  // default) unless both sides are landscape, then on its short edge.
  const DECK = "flyers-placeholders.pptx";
  const SLIDE_COUNT = 2; // one pick per slide
  const MEDIA = "ppt/media/";
  const CONTENT_TYPES = "[Content_Types].xml";
  // What PowerPoint reads as it is. Anything else (WebP) is converted to a JPEG on a canvas.
  const EMBED = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif" };
  const JPEG_QUALITY = 0.92;
  const ROTATE_CW = 5400000; // `rot` is clockwise in 60000ths of a degree: 90°
  const RATIO = 1283 / 1761; // short side / long side, the deck's frames and the gallery's images
  // A picture frame's position and size (EMU) in a <p:pic> block.
  const FRAME = /<a:xfrm(?: rot="-?\d+")?><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/><\/a:xfrm>/;
  const RATIO_TOLERANCE = 0.001; // generate.py leaves a gallery image exact or more than 0.5 % off

  // Whether the picture has the frames' ratio (in either orientation).
  const fits = (image) => image.w > 0 && image.h > 0 && Math.abs(Math.min(image.w, image.h) / Math.max(image.w, image.h) / RATIO - 1) <= RATIO_TOLERANCE;

  const extension = (name) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

  async function decode(blob) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(blob);
      } catch {} // e.g. an unsupported format: the <img> below still decodes it
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("the picture could not be decoded"));
        image.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight, source: image };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // The picture's file, in a format the deck can hold: `{ blob, ext, width, height }`.
  async function pictureFile(image) {
    const response = await fetch(image.src);
    if (!response.ok) throw new Error(`${image.id}: HTTP ${response.status}`);
    const blob = await response.blob();
    const ext = extension(image.file);
    if (EMBED[ext]) return { blob, ext, width: image.w, height: image.h };
    const picture = await decode(blob);
    const canvas = document.createElement("canvas");
    canvas.width = picture.width;
    canvas.height = picture.height;
    canvas.getContext("2d").drawImage(picture.source || picture, 0, 0);
    if (picture.close) picture.close();
    const jpeg = await new Promise((resolve, reject) =>
      canvas.toBlob((data) => (data ? resolve(data) : reject(new Error("the picture could not be encoded"))), "image/jpeg", JPEG_QUALITY)
    );
    return { blob: jpeg, ext: "jpg", width: canvas.width, height: canvas.height };
  }

  // The slide's XML with every picture frame turned for a `width` × `height` picture: as it is
  // for a portrait one, and for a landscape one the frame with width and height swapped about its
  // center, rotated back into the frame with `rot`.
  function turned(xml, width, height) {
    let frames = 0;
    const out = xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (pic) => {
      const frame = pic.match(FRAME);
      if (!frame || !pic.includes("<a:stretch>")) return pic;
      frames++;
      if (width <= height) return pic;
      const [x, y, cx, cy] = frame.slice(1).map(Number);
      const xfrm = `<a:xfrm rot="${ROTATE_CW}"><a:off x="${Math.round(x + (cx - cy) / 2)}" y="${Math.round(y + (cy - cx) / 2)}"/><a:ext cx="${cy}" cy="${cx}"/></a:xfrm>`;
      return pic.replace(frame[0], xfrm);
    });
    if (!frames) throw new Error("no picture frame found on the slide");
    return out;
  }

  // The slide's relationships with every picture pointed at `target` (a name in ppt/media);
  // also returns the names they pointed at before.
  function pointedAt(rels, target) {
    const before = [];
    const out = rels.replace(/Target="\.\.\/media\/([^"]+)"/g, (_, name) => {
      before.push(name);
      return `Target="../media/${target}"`;
    });
    if (!before.length) throw new Error("no picture relationship found for the slide");
    return { rels: out, before };
  }

  // The package's content types, with a default for `ext` when there is none yet.
  function typed(types, ext) {
    if (new RegExp(`<Default Extension="${ext}"`, "i").test(types)) return types;
    return types.replace("</Types>", `<Default Extension="${ext}" ContentType="${EMBED[ext]}"/></Types>`);
  }

  // A file name Windows and macOS both accept, made of the two titles ("" for no extension).
  const deckName = (picks, ext = "pptx") => {
    const clean = (title) => title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "flyer";
    return `${picks.map((pick) => clean(pick.title)).join(" + ")}${ext && "." + ext}`;
  };

  // The deck's page size and, per slide, its picture frames (all in EMU): what the preview draws.
  async function deckGeometry() {
    const response = await fetch(DECK, { cache: "no-store" });
    if (!response.ok) throw new Error(`${DECK}: HTTP ${response.status}`);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const part = async (path) => {
      const file = zip.file(path);
      if (!file) throw new Error(`${path} is missing from ${DECK}`);
      return file.async("string");
    };
    const size = (await part("ppt/presentation.xml")).match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
    if (!size) throw new Error(`no slide size in ${DECK}`);
    const slides = [];
    for (let n = 1; n <= SLIDE_COUNT; n++) {
      const xml = await part(`ppt/slides/slide${n}.xml`);
      const frames = (xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [])
        .filter((pic) => pic.includes("<a:stretch>"))
        .map((pic) => pic.match(FRAME))
        .filter(Boolean)
        .map(([, x, y, cx, cy]) => ({ x: Number(x), y: Number(y), cx: Number(cx), cy: Number(cy) }));
      if (!frames.length) throw new Error(`no picture frame on slide ${n}`);
      slides.push(frames);
    }
    return { page: { cx: Number(size[1]), cy: Number(size[2]) }, slides };
  }

  // Places `picks` in the deck (one per slide, in that order) and hands it to the browser.
  async function buildDeck(picks, onProgress) {
    onProgress("Loading the flyers…");
    const response = await fetch(DECK, { cache: "no-store" });
    if (!response.ok) throw new Error(`${DECK}: HTTP ${response.status}`);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const part = (path) => {
      const file = zip.file(path);
      if (!file) throw new Error(`${path} is missing from ${DECK}`);
      return file.async("string");
    };

    let types = await part(CONTENT_TYPES);
    const replaced = new Set();
    for (let index = 0; index < SLIDE_COUNT; index++) {
      const pick = picks[index];
      const n = index + 1;
      const slidePath = `ppt/slides/slide${n}.xml`;
      const relsPath = `ppt/slides/_rels/slide${n}.xml.rels`;
      onProgress(`Fetching ${pick.title}…`);
      const picture = await pictureFile(pick);
      const name = `flyer${n}.${picture.ext}`;
      const { rels, before } = pointedAt(await part(relsPath), name);
      zip.file(relsPath, rels);
      zip.file(slidePath, turned(await part(slidePath), picture.width, picture.height));
      zip.file(MEDIA + name, picture.blob, { compression: "STORE" }); // already compressed
      before.forEach((old) => replaced.add(old));
      types = typed(types, picture.ext);
      onProgress(`Placed ${pick.title} on the ${index ? "back" : "front"}`);
    }
    zip.file(CONTENT_TYPES, types);
    for (const old of replaced) if (!/^flyer\d+\./.test(old)) zip.remove(MEDIA + old);

    onProgress("Packing the flyers…");
    // The XML parts keep their compression (JSZip remembers it); the pictures were added STORE.
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => onProgress(`Packing ${Math.round(meta.percent)}%`));
    const url = URL.createObjectURL(blob);
    saveAs(url, deckName(picks));
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }


  // ---------- the PDF ----------

  // The same two pages as the deck, written by hand (no library): the deck's page size and
  // frames (from deckGeometry), one image object per page drawn in its four frames, a
  // landscape picture turned clockwise by the drawing matrix, and the page's center cross
  // dashed for the cut, like the deck's lines. A JPEG goes in as it is (PDF holds JPEG natively,
  // DCTDecode); anything else is drawn on a canvas and stored lossless (FlateDecode, deflated
  // by the browser's CompressionStream; as a JPEG where the browser has none).
  const EMU_PER_PT = 12700;

  // The number of color components of a JPEG, from its first frame header (SOF marker).
  function jpegComponents(bytes) {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return 3;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return bytes[i + 9];
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return 3;
  }

  // The picture as a PDF image object's stream and dictionary entries.
  async function pdfImage(image) {
    const response = await fetch(image.src);
    if (!response.ok) throw new Error(`${image.id}: HTTP ${response.status}`);
    const blob = await response.blob();
    const ext = extension(image.file);
    if (ext === "jpg" || ext === "jpeg") {
      const data = new Uint8Array(await blob.arrayBuffer());
      const space = { 1: "/DeviceGray", 3: "/DeviceRGB", 4: "/DeviceCMYK" }[jpegComponents(data)] || "/DeviceRGB";
      return { data, width: image.w, height: image.h, dict: `/ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode` };
    }
    const picture = await decode(blob);
    const canvas = document.createElement("canvas");
    canvas.width = picture.width;
    canvas.height = picture.height;
    const context = canvas.getContext("2d");
    context.drawImage(picture.source || picture, 0, 0);
    if (picture.close) picture.close();
    if (!window.CompressionStream) {
      const jpeg = await new Promise((resolve, reject) =>
        canvas.toBlob((data) => (data ? resolve(data) : reject(new Error("the picture could not be encoded"))), "image/jpeg", JPEG_QUALITY)
      );
      return { data: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height, dict: "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode" };
    }
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    const deflated = await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
    return { data: new Uint8Array(deflated), width: canvas.width, height: canvas.height, dict: "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode" };
  }

  // The drawing of one page: the picture in every frame, then the cut cross. PDF's origin is
  // the bottom left. A landscape picture is turned clockwise: the image's width runs down the
  // frame from its top left corner, its height runs right.
  function pdfPage(frames, page, landscape) {
    const pt = (emu) => emu / EMU_PER_PT;
    const num = (value) => String(Math.round(value * 1000) / 1000);
    const W = pt(page.cx);
    const H = pt(page.cy);
    let ops = "";
    for (const f of frames) {
      const x = pt(f.x);
      const w = pt(f.cx);
      const h = pt(f.cy);
      const y = H - pt(f.y) - h;
      ops += landscape
        ? `q 0 ${num(-h)} ${num(w)} 0 ${num(x)} ${num(y + h)} cm /Im Do Q\n`
        : `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im Do Q\n`;
    }
    ops += `q 0.6 G 0.25 w [3 3] 0 d 0 ${num(H / 2)} m ${num(W)} ${num(H / 2)} l ${num(W / 2)} 0 m ${num(W / 2)} ${num(H)} l S Q\n`;
    return { ops, W: num(W), H: num(H) };
  }

  async function buildPdf(picks, geometry, onProgress) {
    const encoder = new TextEncoder();
    const chunks = [];
    let length = 0;
    const offsets = [];
    const push = (data) => {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      chunks.push(bytes);
      length += bytes.length;
    };
    const object = (id, body) => {
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      push(body);
      push("\nendobj\n");
    };
    const stream = (id, dict, data) => {
      offsets[id] = length;
      push(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
      push(data);
      push("\nendstream\nendobj\n");
    };
    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment
    const count = geometry.slides.length;
    const ids = (index) => ({ page: 3 + 3 * index, contents: 4 + 3 * index, image: 5 + 3 * index });
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, `<< /Type /Pages /Kids [${geometry.slides.map((_, i) => `${ids(i).page} 0 R`).join(" ")}] /Count ${count} >>`);
    for (let index = 0; index < count; index++) {
      const pick = picks[index];
      const id = ids(index);
      onProgress(`Preparing ${pick.title}…`);
      const image = await pdfImage(pick);
      const { ops, W, H } = pdfPage(geometry.slides[index], geometry.page, pick.w > pick.h);
      object(id.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im ${id.image} 0 R >> >> /Contents ${id.contents} 0 R >>`);
      stream(id.contents, "", encoder.encode(ops));
      stream(id.image, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ${image.dict}`, image.data);
      onProgress(`Placed ${pick.title} on the ${index ? "back" : "front"}`);
    }
    const total = 3 + 3 * count;
    const xref = length;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const url = URL.createObjectURL(new Blob(chunks, { type: "application/pdf" }));
    saveAs(url, deckName(picks, "pdf"));
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------- the print-ready page ----------

  // A new tab with the two pages at the deck's page size (an @page rule; the frames in inches
  // from the deck's geometry, the originals in them, a landscape one turned as in the preview)
  // and a Print button, hidden when printing. The browser prints it or saves it as a PDF.
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function openPrintPage(picks, geometry) {
    const EMU_PER_IN = 914400;
    const inches = (emu) => `${Math.round((emu / EMU_PER_IN) * 10000) / 10000}in`;
    const W = inches(geometry.page.cx);
    const H = inches(geometry.page.cy);
    const pages = geometry.slides
      .map((frames, index) => {
        const pick = picks[index];
        const turned = pick.w > pick.h;
        const src = escapeHtml(new URL(pick.src, location.href).href);
        const alt = escapeHtml(pick.title);
        const boxes = frames
          .map(
            (f) =>
              `<div class="frame" style="left:${inches(f.x)};top:${inches(f.y)};width:${inches(f.cx)};height:${inches(f.cy)}">` +
              `<img src="${src}" alt="${alt}"${turned ? ` class="turned" style="height:${RATIO * 100}%"` : ""}></div>`
          )
          .join("");
        return `<section class="page">${boxes}<div class="cut h"></div><div class="cut v"></div></section>`;
      })
      .join("\n");
    const title = escapeHtml(deckName(picks, ""));
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
@page { size: ${W} ${H}; margin: 0; }
html, body { margin: 0; }
body { background: #6b7280; font: 14px system-ui, sans-serif; }
.tools { position: sticky; top: 0; display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #ddd; }
.tools button { font: inherit; padding: 4px 12px; }
.page { position: relative; width: ${W}; height: ${H}; margin: 16px auto; background: #fff; overflow: hidden; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4); break-after: page; }
.frame { position: absolute; overflow: hidden; }
.frame img { position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; transform: translate(-50%, -50%); }
.frame img.turned { width: auto; transform: translate(-50%, -50%) rotate(90deg); }
.cut { position: absolute; border: 0 dashed #999; }
.cut.h { left: 0; right: 0; top: 50%; border-top-width: 0.25pt; }
.cut.v { top: 0; bottom: 0; left: 50%; border-left-width: 0.25pt; }
@media print {
  body { background: none; }
  .tools { display: none; }
  .page { margin: 0; box-shadow: none; }
}
</style>
</head>
<body>
<div class="tools"><button onclick="print()">Print…</button><span>Paper ${W} × ${H} or "fit to page", margins none. Cut along the dashed lines.</span></div>
${pages}
</body>
</html>
`;
    const tab = window.open("", "_blank");
    if (!tab) throw new Error("the browser blocked the new tab");
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
  }

  // ---------- the page ----------

  const HINT_MS = 3500;

  function ComposeApp() {
    const [gallery, setGallery] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [picks, setPicks] = useState([]);
    const picksRef = useRef(picks);
    picksRef.current = picks;
    const [hint, setHint] = useState(null); // a third pick was tried
    const [showHelp, setShowHelp] = useState(false); // the ? in the toolbar
    const [preview, setPreview] = useState(null); // the deck's geometry while the preview is open
    const [busy, setBusy] = useState(null);
    const [failure, setFailure] = useState(null);
    const [route, go] = useRoute();

    useEffect(() => {
      // gallery+.jsonc, when it exists, is used instead of gallery.jsonc (generate.py does the
      // same). The "" date: no "new" badges here, and no visit of the gallery recorded.
      const load = async () => {
        let response = await fetch(OVERRIDE_FILE, { cache: "no-cache" });
        if (!response.ok) response = await fetch(GALLERY_FILE, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalize(parseJsonc(await response.text()), "");
      };
      load()
        .then(setGallery)
        .catch((error) => setLoadError(String(error.message || error)));
    }, []);

    const categories = gallery ? gallery.categories : [];
    const category = categories.find((c) => c.folder === route.folder) || categories[0] || null;
    const openImage = (route.file && category && category.images.find((image) => image.file === route.file)) || null;
    // ← / →, a swipe and the ‹ / › buttons go to the previous/next tab, as in the gallery.
    const { mainRef, toolbarRef, swipeTabs, tabButtons } = useTabSwitch({ categories, category, go, active: Boolean(gallery) && !openImage });

    useEffect(() => {
      if (gallery) document.title = openImage ? `${openImage.title} – Compose` : `Compose – ${gallery.site.title}`;
    }, [gallery, openImage]);

    useEffect(() => {
      if (!hint) return;
      const timer = setTimeout(() => setHint(null), HINT_MS);
      return () => clearTimeout(timer);
    }, [hint]);

    useEffect(() => {
      if (!preview) return;
      const onKey = (event) => event.key === "Escape" && setPreview(null);
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [preview]);
    // A pick given up while the preview is open (Esc, then the card) closes it: it shows two.
    useEffect(() => {
      if (picks.length !== SLIDE_COUNT) setPreview(null);
    }, [picks]);

    // The picks are an array: the first is the front, the second the back. With both taken, or
    // for a picture off the frames' ratio, a pick is refused with a hint (React puts the checkbox
    // back by itself).
    const togglePick = useCallback((image) => {
      const current = picksRef.current;
      if (current.some((pick) => pick.id === image.id)) {
        setPicks(current.filter((pick) => pick.id !== image.id));
      } else if (!fits(image)) {
        setHint(`${image.title} does not have the flyers' ratio (1283:1761) and cannot be placed`);
      } else if (current.length < SLIDE_COUNT) {
        setPicks([...current, image]);
      } else {
        setHint("Both sides are taken: unselect a picture first");
      }
    }, []);

    const open = useCallback((image) => go(image.folder, image.file), [go]);
    const moveTo = useCallback((image) => go(image.folder, image.file, { replace: true }), [go]);
    const close = useCallback(() => go(category.folder, null, { replace: true }), [go, category]);
    const download = useCallback(
      async (images) => {
        if (busy || !images.length) return;
        setFailure(null);
        try {
          await downloadImages(images, images.length > 1 ? `${slug(images[0].folder)}.zip` : "", setBusy);
        } catch (error) {
          setFailure(`Download failed: ${error.message || error}`);
        }
        setBusy(null);
      },
      [busy]
    );

    // Compose opens the preview of the two filled pages; its Download button builds the deck.
    const compose = async () => {
      if (picks.length !== SLIDE_COUNT || busy) return;
      setFailure(null);
      try {
        setBusy("Loading the flyers…");
        setPreview(await deckGeometry());
      } catch (error) {
        setFailure(`Compose failed: ${error.message || error}`);
      }
      setBusy(null);
    };
    // The preview's outputs: the deck, the PDF, the print-ready page.
    const produce = (make) => async () => {
      if (busy) return;
      setFailure(null);
      try {
        await make();
      } catch (error) {
        setFailure(`Failed: ${error.message || error}`);
      }
      setBusy(null);
    };
    const downloadDeck = produce(() => buildDeck(picks, setBusy));
    const downloadPdf = produce(() => buildPdf(picks, preview, setBusy));
    const print = produce(() => openPrintPage(picks, preview));

    if (loadError) {
      return html`
        <main className="message">
          <h1>The gallery could not be loaded</h1>
          <p>${OVERRIDE_FILE} / ${GALLERY_FILE}: ${loadError}</p>
          ${location.protocol === "file:" && html`<p>The page was opened as a file. Start <code>serve.bat</code> and use the http://localhost address.</p>`}
        </main>
      `;
    }
    if (!gallery) return html`<main className="message"><p>Loading…</p></main>`;
    if (!category) {
      return html`<main className="message"><h1>Compose</h1><p>There are no images to choose from.</p></main>`;
    }

    // The tab's images as in the gallery: the current ones, then the archived under their rule.
    const current = category.images.filter((image) => !image.archived);
    const archived = category.images.filter((image) => image.archived);
    const tile = (image) => {
      const at = picks.findIndex((pick) => pick.id === image.id);
      return html`<${Tile} key=${image.id} image=${image} selected=${at >= 0} order=${at >= 0 ? at + 1 : undefined} onToggle=${togglePick} onOpen=${open} />`;
    };

    // A slot: its number (1 the front, 2 the back) and the picture (its title is on its card and
    // in the lightbox) with a ✕ that gives it up, or "Pick a picture".
    const slot = (index) => {
      const pick = picks[index];
      return html`
        <div key=${index} className=${`slot${pick ? " filled" : ""}`} title=${pick ? pick.title : "Pick a picture"}>
          <span className="badge order">${index + 1}</span>
          ${pick
            ? html`
                <img src=${pick.thumb} alt=${pick.title} />
                <button className="x" onClick=${() => togglePick(pick)} aria-label="Unselect this picture">✕</button>
              `
            : html`<span className="muted">Pick a picture</span>`}
        </div>
      `;
    };

    return html`
      <header className="top">
        <img className="logo" src="logo-small-borderless-transparent.png" alt=${gallery.site.title} />
        <${Tabs} categories=${categories} category=${category} go=${go} showCounts=${false} />
      </header>

      <main ref=${mainRef} ...${swipeTabs}>
        <div className="current">
          <div ref=${toolbarRef} className=${picks.length ? "toolbar sticky" : "toolbar"}>
            <div className="slots">
              <button className=${`help${showHelp ? " on" : ""}`} onClick=${() => setShowHelp((on) => !on)} aria-expanded=${showHelp} aria-label="How this works">?</button>
              ${slot(0)}${slot(1)}
            </div>
            <div className="actions">
              ${(failure || busy || hint) &&
              html`
                <div className="status">
                  ${failure && html`<span className="failure">${failure}</span>`}
                  ${busy && html`<span className="muted">${busy}</span>`}
                  ${!failure && !busy && hint && html`<span className="muted">${hint}</span>`}
                </div>
              `}
              <div className="buttons">
                <button className="primary" disabled=${picks.length !== SLIDE_COUNT || Boolean(busy)} onClick=${compose}>Compose</button>
                ${failure && !busy && html`<button onClick=${() => setFailure(null)}>Dismiss</button>`}
              </div>
            </div>
            ${showHelp && html`<p className="help-text muted">Pick two pictures, in order: the first goes on the front of the flyers, the second on the back.</p>`}
          </div>
          <div className="grid">${current.map(tile)}</div>
        </div>
        ${archived.length > 0 &&
        html`
          <section className="archive">
            <div className="divider"><span className="archived-tag">Archived</span></div>
            <div className="grid">${archived.map(tile)}</div>
          </section>
        `}
      </main>
      ${!openImage && tabButtons}

      ${preview &&
      html`
        <div className="preview" role="dialog" aria-label="The flyers">
          <div className="bar">
            <h2>${deckName(picks, "")}</h2>
            ${(failure || busy) &&
            html`
              <div className="status">
                ${failure && html`<span className="failure">${failure}</span>`}
                ${busy && html`<span className="muted">${busy}</span>`}
              </div>
            `}
            <button className="primary" disabled=${Boolean(busy)} onClick=${downloadPdf}>Download PDF</button>
            <button className="primary" disabled=${Boolean(busy)} onClick=${downloadDeck}>Download PowerPoint</button>
            <button disabled=${Boolean(busy)} onClick=${print}>Print…</button>
            <button onClick=${() => setPreview(null)} aria-label="Close">✕</button>
          </div>
          <div className="sheets">
            ${preview.slides.map((frames, index) => {
              const pick = picks[index];
              const pct = (value, of) => `${(value / of) * 100}%`;
              const turned = pick.w > pick.h;
              return html`
                <figure key=${index}>
                  <div className="page" style=${{ aspectRatio: `${preview.page.cx} / ${preview.page.cy}` }}>
                    ${frames.map((f, i) => html`
                      <div
                        key=${i}
                        className="frame"
                        style=${{ left: pct(f.x, preview.page.cx), top: pct(f.y, preview.page.cy), width: pct(f.cx, preview.page.cx), height: pct(f.cy, preview.page.cy) }}
                      >
                        <img src=${pick.thumb} alt="" className=${turned ? "turned" : ""} style=${turned ? { height: `${RATIO * 100}%` } : null} />
                      </div>
                    `)}
                  </div>
                  <figcaption>${index ? "Back" : "Front"} — ${pick.title}</figcaption>
                </figure>
              `;
            })}
          </div>
        </div>
      `}

      ${openImage &&
      html`
        <${Lightbox}
          images=${category.images}
          image=${openImage}
          selected=${picks.some((pick) => pick.id === openImage.id)}
          onToggle=${togglePick}
          onMove=${moveTo}
          onClose=${close}
          onDownload=${download}
        />
      `}
    `;
  }

  ReactDOM.createRoot(document.getElementById("compose")).render(html`<${ComposeApp} />`);
})();
