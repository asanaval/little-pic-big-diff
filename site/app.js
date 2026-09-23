(() => {
  const { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, memo } = React;
  const html = htm.bind(React.createElement);

  const GALLERY_FILE = "gallery.jsonc";
  const OVERRIDE_FILE = "gallery+.jsonc";
  const SELECTION_KEY = "lpbd-selection";
  const VISIT_KEY = "lpbd-last-visit";
  // The ZIP is built in the browser's memory, so a selection over the site's maxDownloadMB can be
  // made but not downloaded: this message shows instead of the count and the download button.
  const TOO_LARGE = "Selection is too large to download";
  const FETCHES_AT_ONCE = 4;
  const COUNT_SCRIPT = "https://gc.zgo.at/count.js";
  const COUNT_LOCAL_W = "asana"; // put into the address as ?w=… on localhost when it has no w
  const COUNT_GAP_MS = 300; // GoatCounter refuses more than 4 hits per second per address
  const COUNT_REF_MAX = 2000; // GoatCounter cuts longer referrer values

  // ---------- usage counting (GoatCounter) ----------
  // Enabled by "goatcounter": "https://<code>.goatcounter.com/count" in the site block of
  // gallery.jsonc; without it nothing is loaded and nothing is sent. One hit per page view or
  // action, queued and sent one every COUNT_GAP_MS; hits still queued when the tab closes are
  // lost. Every hit's path ends with "?w=<value>" when the page address has a w query item
  // (https://…/?w=asana#folder). On localhost (serve.bat) hits are sent too, and ?w=COUNT_LOCAL_W
  // is added to the address first when it has no w. #toggle-goatcounter switches count.js
  // off/on for a browser.
  // Page views: path "/#folder" or "/#folder/file". Events: path
  // "<event>/<file>" (bare name, no folder or extension), "<event>/<folder>" or "<event>",
  // details in the referrer field.
  const track = (() => {
    const queue = [];
    let enabled = null; // null = not decided yet (before gallery.jsonc is read)
    let timer = null;
    const send = () => {
      const hit = queue.shift();
      if (!hit) return (timer = null);
      try {
        window.goatcounter.count(hit);
      } catch {}
      timer = setTimeout(send, COUNT_GAP_MS);
    };
    const drain = () => {
      if (enabled && !timer && typeof window.goatcounter?.count === "function") send();
    };
    const isLocal = location.protocol === "file:" || /^(localhost$|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0$|\[::1\]$)/.test(location.hostname);
    const query = new URLSearchParams(location.search);
    if (isLocal && !query.has("w")) {
      query.set("w", COUNT_LOCAL_W);
      history.replaceState(history.state, "", `${location.pathname}?${query}${location.hash}`);
    }
    const marks = new URLSearchParams();
    if (query.get("w")) marks.set("w", query.get("w"));
    const suffix = marks.size ? "?" + marks : "";
    const count = (hit) => {
      if (enabled === false) return;
      queue.push({ ...hit, path: hit.path + suffix });
      drain();
    };
    const event = (path, title, referrer = "") => count({ path, title, referrer, event: true });
    // Filenames are unique across folders, so an image is logged by the bare name only:
    // no folder, no extension.
    const bareName = (image) => image.file.replace(/\.[^.]+$/, "");
    const list = (images) => {
      const names = images.map(bareName);
      let text = names.join(";");
      let dropped = 0;
      while (text.length > COUNT_REF_MAX - 12) text = names.slice(0, names.length - ++dropped).join(";");
      return dropped ? `${text};+${dropped}` : text;
    };
    return {
      start(endpoint) {
        enabled = /^https:\/\//.test(endpoint || "");
        if (!enabled) return (queue.length = 0);
        window.goatcounter = { no_onload: true, no_events: true, allow_local: isLocal, endpoint };
        const script = document.createElement("script");
        script.async = true;
        script.src = COUNT_SCRIPT;
        script.dataset.goatcounter = endpoint;
        script.addEventListener("load", drain);
        document.head.append(script);
      },
      view: (hash, title) => count({ path: "/#" + hash, title }),
      select: (image, selected, via) => event(`${selected ? "select" : "unselect"}/${bareName(image)}`, image.title, via),
      selectAll: (category, selected) => event(`${selected ? "select" : "unselect"}-all/${category.folder}`, category.title),
      clear: () => event("clear", "Clear selection"),
      // One hit per download, whether one file or a ZIP; the image names are in the referrer field.
      download: (images) => event("download", "Download", list(images)),
      // Something went wrong for the visitor: `what` names the step, the message is in the referrer.
      error: (what, message) => event(`error/${what}`, "Error", String(message).slice(0, 500)),
      // Reserved for later: no button sends these yet.
      vote: (image, up) => event(`${up ? "upvote" : "downvote"}/${bareName(image)}`, image.title),
      report: (image, reason) => event(`report/${bareName(image)}`, image.title, reason),
    };
  })();

  // ---------- data ----------

  // JSON with // and /* */ comments and trailing commas (generate.py comments out deleted images).
  function parseJsonc(text) {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        out += c;
        if (c === "\\") out += text[++i] ?? "";
        else if (c === '"') inString = false;
      } else if (c === '"') {
        inString = true;
        out += c;
      } else if (c === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
      } else if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        i = end < 0 ? text.length : end + 1;
      } else if (c === "}" || c === "]") {
        out = out.trimEnd();
        if (out.endsWith(",")) out = out.slice(0, -1);
        out += c;
      } else {
        out += c;
      }
    }
    return JSON.parse(out);
  }

  const urlPath = (...parts) => parts.map(encodeURIComponent).join("/");

  // "New" = added since this visitor's previous visit. A first visit shows no badges. The
  // reference date is fixed for the browser tab's lifetime, so a reload keeps the badges.
  function previousVisit() {
    try {
      const reference = sessionStorage.getItem(VISIT_KEY) || localStorage.getItem(VISIT_KEY) || "";
      sessionStorage.setItem(VISIT_KEY, reference);
      localStorage.setItem(VISIT_KEY, new Date().toISOString().slice(0, 10));
      return reference;
    } catch {
      return "";
    }
  }

  function normalize(raw) {
    const site = {
      title: "Gallery",
      description: "",
      showClearButton: false,
      showDownloadAllButton: false,
      rememberSelection: false,
      showImageCounts: false,
      maxDownloadMB: 100,
      ...raw.site,
    };
    const newSince = previousVisit();
    const categories = (raw.categories || [])
      .map((category) => ({
        ...category,
        title: category.title || category.folder,
        images: (category.images || []).map((image) => {
          const ratio = image.w && image.h ? image.w / image.h : 1;
          const src = urlPath("images", category.folder, image.file);
          return {
            ...image,
            id: `${category.folder}/${image.file}`,
            folder: category.folder,
            title: image.title || image.file,
            src,
            thumb: urlPath("thumbs", category.folder, image.file + ".webp"),
            // Every card has the same picture box, 306:420 or 420:306. generate.py makes every
            // thumbnail exactly that size, so the box is always filled.
            shape: ratio >= 1 ? "landscape" : "portrait",
            box: ratio >= 1 ? "420 / 306" : "306 / 420",
            isNew: Boolean(newSince && image.added && image.added > newSince),
          };
        }),
      }))
      // A category with "hidden": true in gallery.jsonc, or without a visible image, gets no tab.
      .filter((category) => !category.hidden && category.images.length);
    // The z-demo-* folders are only there to try the site out: hidden once real categories exist.
    const real = categories.filter((category) => !category.folder.startsWith("z-demo-"));
    return { site, categories: real.length ? real : categories };
  }

  // "512 KB", "1.4 MB", "12 MB", "1.4 GB", "12 GB": one decimal below 10, none from 10 up.
  function formatBytes(bytes) {
    if (!bytes) return "";
    const unit = (value, name) => `${Math.round(value * 10) >= 100 ? Math.round(value) : value.toFixed(1)} ${name}`; // 9.96 -> "10", not "10.0"
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return unit(bytes / 1024 / 1024, "MB");
    return unit(bytes / 1024 / 1024 / 1024, "GB");
  }

  const totalBytes = (images) => images.reduce((sum, image) => sum + (image.bytes || 0), 0);
  // "Download 1.4 MB" (one file is sent as it is, several as a ZIP).
  const downloadLabel = (images, prefix = "Download") => `${prefix} ${formatBytes(totalBytes(images))}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ---------- download ----------

  function saveAs(href, name) {
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function downloadImages(images, zipName, onProgress) {
    if (images.length === 1) {
      saveAs(images[0].src, images[0].file);
      track.download(images);
      return;
    }
    const zip = new JSZip();
    const oneFolder = new Set(images.map((image) => image.folder)).size === 1;
    const queue = [...images];
    let fetched = 0;
    onProgress(`Fetching 0 of ${images.length}`);
    const worker = async () => {
      while (queue.length) {
        const image = queue.shift();
        const response = await fetch(image.src);
        if (!response.ok) throw new Error(`${image.id}: HTTP ${response.status}`);
        zip.file(oneFolder ? image.file : image.id, await response.blob());
        onProgress(`Fetching ${++fetched} of ${images.length}`);
      }
    };
    await Promise.all(Array.from({ length: FETCHES_AT_ONCE }, worker));
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) =>
      onProgress(`Zipping ${Math.round(meta.percent)}%`)
    );
    const url = URL.createObjectURL(blob);
    saveAs(url, zipName);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    track.download(images);
  }

  const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gallery";

  // ---------- address: #folder or #folder/file ----------

  function readRoute() {
    const hash = location.hash.slice(1);
    if (!hash) return { folder: null, file: null };
    const cut = hash.indexOf("/");
    const decode = (part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    };
    if (cut < 0) return { folder: decode(hash), file: null };
    return { folder: decode(hash.slice(0, cut)), file: decode(hash.slice(cut + 1)) };
  }

  function useRoute() {
    const [route, setRoute] = useState(readRoute);
    useEffect(() => {
      const update = () => setRoute(readRoute());
      window.addEventListener("popstate", update);
      window.addEventListener("hashchange", update);
      return () => {
        window.removeEventListener("popstate", update);
        window.removeEventListener("hashchange", update);
      };
    }, []);
    const go = useCallback((folder, file, { replace = false, state = null } = {}) => {
      const hash = "#" + (file ? urlPath(folder, file) : urlPath(folder));
      history[replace ? "replaceState" : "pushState"](state, "", hash);
      setRoute({ folder, file: file || null });
    }, []);
    return [route, go];
  }

  // ---------- selection, remembered in this browser ----------

  // `remember` is the site's rememberSelection setting, null until the gallery has loaded. The
  // stored selection is read at once (the grid is not shown before the gallery anyway); App
  // clears it, in the render that shows the gallery, when the setting is off.
  function useSelection(remember) {
    const [selection, setSelection] = useState(() => {
      try {
        return new Set(JSON.parse(localStorage.getItem(SELECTION_KEY)) || []);
      } catch {
        return new Set();
      }
    });
    useEffect(() => {
      if (remember === null) return;
      try {
        if (remember) localStorage.setItem(SELECTION_KEY, JSON.stringify([...selection]));
        else localStorage.removeItem(SELECTION_KEY);
      } catch {}
    }, [selection, remember]);
    const current = useRef(selection);
    current.current = selection;
    // via = where the click came from ("card", "lightbox"), only used for counting.
    const toggle = useCallback((image, via) => {
      track.select(image, !current.current.has(image.id), via);
      setSelection((old) => {
        const next = new Set(old);
        if (!next.delete(image.id)) next.add(image.id);
        return next;
      });
    }, []);
    const setMany = useCallback((ids, selected) => {
      setSelection((old) => {
        const next = new Set(old);
        ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
        return next;
      });
    }, []);
    const clear = useCallback(() => setSelection(new Set()), []);
    const keepOnly = useCallback((validIds) => {
      setSelection((old) => {
        const next = new Set([...old].filter((id) => validIds.has(id)));
        return next.size === old.size ? old : next;
      });
    }, []);
    return { selection, toggle, setMany, clear, keepOnly };
  }

  // ---------- components ----------

  // True when the media query matches, kept up to date.
  function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => matchMedia(query).matches);
    useEffect(() => {
      const list = matchMedia(query);
      const update = () => setMatches(list.matches);
      update();
      list.addEventListener("change", update);
      return () => list.removeEventListener("change", update);
    }, [query]);
    return matches;
  }
  const PHONE_QUERY = "(max-width: 520px)"; // = the phone breakpoint in style.css

  // The grid's rows are tiny (--r) and the card takes its natural height (frame + picture box +
  // footer), so the card tells the grid how many rows it spans. Re-measured on resize.
  function useRowSpan() {
    const ref = useRef(null);
    useEffect(() => {
      const card = ref.current;
      const fit = () => {
        const row = parseFloat(getComputedStyle(card.parentElement).gridAutoRows);
        const height = card.getBoundingClientRect().height + parseFloat(getComputedStyle(card).marginBottom);
        card.style.gridRowEnd = `span ${Math.ceil(height / row)}`;
      };
      const observer = new ResizeObserver(fit);
      observer.observe(card);
      return () => observer.disconnect();
    }, []);
    return ref;
  }

  const Tile = memo(function Tile({ image, selected, onToggle, onOpen }) {
    const ref = useRowSpan();
    return html`
      <div ref=${ref} className=${`tile ${image.shape}${selected ? " selected" : ""}`}>
        <button className="pic" style=${{ aspectRatio: image.box }} onClick=${() => onOpen(image)} title=${image.title}>
          <img src=${image.thumb} alt=${image.title} loading="lazy" decoding="async" />
        </button>
        ${image.isNew && html`<span className="badge">new</span>`}
        <label className="foot" title=${image.title}>
          <input type="checkbox" checked=${selected} onChange=${() => onToggle(image, "card")} />
          <span className="check"></span>
          <span className="caption">— ${image.title} —</span>
        </label>
      </div>
    `;
  });

  // Touch handlers (to spread on an element) recognizing a one-finger horizontal swipe. The
  // first 8 px of a move decide whether it is sideways (ours) or vertical (the browser's, a
  // scroll); a second finger (a pinch zoom, the browser's too) drops it. `allowed()` is asked at
  // the touch; `drag(dx)` follows the finger; `end(dx, far)` gets the release, `far` when the
  // drag passed a quarter of the element's width or was a quick flick; a dropped swipe ends
  // with `end(0, false)`. `dragY` / `endY`, when given, do the same for a vertical move (a
  // quarter of the height); without them a vertical move is left alone (a scroll).
  function useSwipe({ allowed = () => true, drag, end, dragY, endY }) {
    const touch = useRef(null); // {x, y, t, axis} while a finger is down
    const cancel = () => {
      const d = touch.current;
      if (d && d.axis === "x") end(0, false);
      if (d && d.axis === "y" && endY) endY(0, false);
      touch.current = null;
    };
    const onTouchStart = (event) => {
      if (event.touches.length > 1) return cancel();
      if (!allowed()) return;
      const t = event.touches[0];
      touch.current = { x: t.clientX, y: t.clientY, t: performance.now(), axis: null };
    };
    const onTouchMove = (event) => {
      const d = touch.current;
      if (!d) return;
      if (event.touches.length > 1) return cancel();
      const t = event.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (!d.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (d.axis === "x" && drag) drag(dx);
      if (d.axis === "y" && dragY) dragY(dy);
    };
    const onTouchEnd = (event) => {
      const d = touch.current;
      touch.current = null;
      if (!d || !d.axis) return;
      const t = event.changedTouches[0];
      const vertical = d.axis === "y";
      if (vertical && !endY) return;
      const moved = vertical ? t.clientY - d.y : t.clientX - d.x;
      const extent = vertical ? event.currentTarget.clientHeight : event.currentTarget.clientWidth;
      const speed = Math.abs(moved) / (performance.now() - d.t); // px per ms
      const far = Math.abs(moved) > extent / 4 || (speed > 0.5 && Math.abs(moved) > 20);
      (vertical ? endY : end)(moved, far);
    };
    return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancel };
  }

  // Moves `el` to translateX(`target` px) with a transition (none under prefers-reduced-motion,
  // or when it is there already), then runs `then`. `el` is left at the target: `unglide` puts it
  // back, at once, with no transition.
  const SLIDE_MS = 250;
  function glide(el, target, then, axis = "X") {
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SLIDE_MS;
    if (!duration || el.style.transform === `translate${axis}(${target}px)`) return then();
    el.addEventListener("transitionend", then, { once: true });
    el.style.transition = `transform ${duration}ms ease-out`;
    el.style.transform = `translate${axis}(${target}px)`;
  }
  function unglide(el) {
    el.style.transition = "none";
    el.style.transform = "";
  }
  const follow = (el, offset, axis = "X") => {
    el.style.transition = "none";
    el.style.transform = `translate${axis}(${offset}px)`;
  };

  // The lightbox stage is a strip of three slides (previous, current, next) that follows the
  // finger sideways. On release it slides on to the neighbor when the drag went past a quarter
  // of the width or was a quick flick, else it springs back. The arrows and keys slide the same
  // way. The neighbors are in the DOM, so they are loaded before they are needed.
  const PLACES = [[-1, "prev"], [0, "current"], [1, "next"]]; // step from the current image, class

  function Lightbox({ images, image, selected, onToggle, onMove, onClose, onDownload }) {
    const index = images.indexOf(image);
    const count = images.length;
    const strip = useRef(null);
    const sliding = useRef(false); // a slide is under way, or waiting for the new image to render
    const neighbor = (step) => images[(index + step + count) % count];

    const reset = () => {
      unglide(strip.current);
      sliding.current = false;
    };
    // Glides the strip to `target` px. Then, without `then`, the strip springs back at once.
    // With `then` (which changes the image, through the address hash, so not right away), the
    // strip stays where it settled, showing the neighbor, until the render with the new image
    // has been committed: the layout effect below resets it then, before the browser paints, so
    // the new current image takes the neighbor's place with no frame of the old one in between.
    const settle = (target, then) => {
      sliding.current = true;
      glide(strip.current, target, () => (then ? then() : reset()));
    };
    const slide = (step) => {
      if (count < 2 || sliding.current) return;
      settle(-step * strip.current.clientWidth, () => onMove(neighbor(step)));
    };
    useLayoutEffect(() => {
      if (sliding.current) reset();
    }, [image]);

    useEffect(() => {
      const onKey = (event) => {
        if (event.key === "Escape") onClose();
        else if (event.key === "ArrowLeft") slide(-1);
        else if (event.key === "ArrowRight") slide(1);
        else if (event.key === " ") onToggle(image, "lightbox");
        else return;
        event.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    });

    useEffect(() => {
      document.body.classList.add("locked");
      return () => document.body.classList.remove("locked");
    }, []);

    // On phones the lightbox is a sheet: it rises from the bottom (CSS animation) and a downward
    // swipe on the stage drags it along and, past a quarter of the height or with a flick,
    // glides it out and closes it; otherwise it springs back.
    const phone = useMediaQuery(PHONE_QUERY);
    const sheet = useRef(null);

    // On phones, a landscape picture on a portrait phone (or a portrait one on a landscape
    // phone) can be turned to fill the screen: 90° left, so that its bottom is on the right,
    // and back on the next tap. The current slide is given the stage's size with width and
    // height swapped, then rotated about its center. A new image or a turn of the phone puts
    // it back.
    const landscapePhone = useMediaQuery("(orientation: landscape)");
    const mismatch = phone && (image.shape === "landscape") !== landscapePhone;
    const [turned, setTurned] = useState(null); // {w, h}: the stage's size when turned, else null
    useEffect(() => setTurned(null), [image, landscapePhone]);
    const angle = turned && mismatch ? -90 : 0;
    const rotation = useRef(0);
    rotation.current = angle;
    const turn = () => setTurned(turned ? null : { w: strip.current.clientWidth, h: strip.current.clientHeight });
    const turnedStyle = angle
      ? { width: `${turned.h}px`, height: `${turned.w}px`, left: `${(turned.w - turned.h) / 2}px`, top: `${(turned.h - turned.w) / 2}px`, right: "auto", bottom: "auto", transform: `rotate(${angle}deg)` }
      : null;
    // A screen offset or point, in the (possibly rotated) picture's own coordinates.
    const toLocal = (dx, dy) => (rotation.current === -90 ? [-dy, dx] : [dx, dy]);
    const swipe = useSwipe({
      allowed: () => count > 1 && !sliding.current,
      drag: (dx) => follow(strip.current, dx),
      end: (dx, far) => (far ? slide(dx < 0 ? 1 : -1) : settle(0)),
      dragY: phone ? (dy) => follow(sheet.current, Math.max(0, dy), "Y") : undefined,
      endY: phone
        ? (dy, far) => (far && dy > 0 ? glide(sheet.current, sheet.current.clientHeight, onClose, "Y") : glide(sheet.current, 0, () => unglide(sheet.current), "Y"))
        : undefined,
    });

    // Elastic pinch: two fingers scale the current picture around their midpoint and pan it
    // with the midpoint (touch-action: none on the stage, so the browser does no zoom of its
    // own); as soon as one finger lifts, the picture springs back. useSwipe drops its swipe
    // when the second finger lands, and ignores the finger that remains.
    const pinch = useRef(null); // {img, distance, x, y} while two fingers are down
    const between = (touches) => {
      const [a, b] = [touches[0], touches[1]];
      return { distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };
    const pinchStart = (event) => {
      if (event.touches.length !== 2 || pinch.current) return;
      const img = strip.current.querySelector(".slide.current img");
      const start = between(event.touches);
      const box = img.getBoundingClientRect();
      const [ox, oy] = toLocal(start.x - (box.left + box.width / 2), start.y - (box.top + box.height / 2));
      img.style.transition = "none";
      img.style.transformOrigin = `${ox + img.offsetWidth / 2}px ${oy + img.offsetHeight / 2}px`;
      pinch.current = { img, ...start };
    };
    const pinchMove = (event) => {
      const p = pinch.current;
      if (!p || event.touches.length !== 2) return;
      const now = between(event.touches);
      const scale = Math.min(6, Math.max(1, now.distance / p.distance));
      const [tx, ty] = toLocal(now.x - p.x, now.y - p.y);
      p.img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const pinchEnd = (event) => {
      const p = pinch.current;
      if (!p || event.touches.length >= 2) return;
      pinch.current = null;
      p.img.style.transition = `transform ${SLIDE_MS}ms ease-out`;
      p.img.style.transform = "";
    };
    const stage = {
      onTouchStart: (event) => (swipe.onTouchStart(event), pinchStart(event)),
      onTouchMove: (event) => (swipe.onTouchMove(event), pinchMove(event)),
      onTouchEnd: (event) => (swipe.onTouchEnd(event), pinchEnd(event)),
      onTouchCancel: (event) => (swipe.onTouchCancel(event), pinchEnd(event)),
    };

    const facts = [image.w && `${image.w} × ${image.h}`, formatBytes(image.bytes)].filter(Boolean).join(" · ");
    return html`
      <div className="lightbox" role="dialog" aria-modal="true" aria-label=${image.title} ref=${sheet}>
        <div className="stage" ...${stage}>
          <div className="strip" ref=${strip}>
            ${(count > 1 ? PLACES : PLACES.slice(1, 2)).map(([step, place]) => {
              const shown = neighbor(step);
              // With two images the same one is on both sides, so its key needs the place too.
              return html`
                <div key=${count > 2 ? shown.id : `${shown.id}@${place}`} className=${`slide ${place}`} style=${place === "current" ? turnedStyle : null}>
                  <img src=${shown.src} alt=${shown.title} draggable=${false} style=${{ backgroundImage: `url("${shown.thumb}")` }} />
                </div>
              `;
            })}
          </div>
          ${phone
            ? html`<button className="close-top" onClick=${onClose} aria-label="Close">✕</button>`
            : html`<button className="back" onClick=${onClose}>‹ Back</button>`}
          ${mismatch && html`<button className="turn-top" onClick=${turn} aria-label=${angle ? "Turn back" : "Turn"}>${angle ? "↻" : "↺"}</button>`}
          ${count > 1 &&
          html`
            <button className="nav prev" onClick=${() => slide(-1)} aria-label="Previous image">‹</button>
            <button className="nav next" onClick=${() => slide(1)} aria-label="Next image">›</button>
          `}
        </div>
        <div className="lightbox-bar">
          <div className="lightbox-text">
            <strong>${image.title}</strong>
            <span>${index + 1} / ${images.length}${facts && ` · ${facts}`}</span>
          </div>
          <button className="primary" onClick=${() => onDownload([image])}>Download</button>
          <button className=${selected ? "on" : ""} onClick=${() => onToggle(image, "lightbox")}>
            ${selected ? "✓ Selected" : "Select"}
          </button>
          ${!phone && html`<button className="close" onClick=${onClose} aria-label="Close">✕</button>`}
        </div>
      </div>
    `;
  }

  // The tab strip scrolls sideways when it does not fit (phones), and nothing shows that by
  // itself (its scrollbar is hidden). So a ≪ or ≫ overlays the edge behind which more tabs hide;
  // tapping it scrolls most of a screenful that way. The active tab is kept in view.
  function Tabs({ categories, category, go, showCounts }) {
    const ref = useRef(null);
    const [more, setMore] = useState({ left: false, right: false });
    useEffect(() => {
      const nav = ref.current;
      const update = () => {
        const left = nav.scrollLeft > 1;
        const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
        setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
      };
      update();
      nav.addEventListener("scroll", update, { passive: true });
      const observer = new ResizeObserver(update);
      observer.observe(nav);
      return () => {
        nav.removeEventListener("scroll", update);
        observer.disconnect();
      };
    }, [categories]);
    // Scrolls the strip so that the active tab is in the middle (as far as the ends allow), so
    // it is never under a ≪ / ≫ overlay. A no-op when every tab fits.
    useEffect(() => {
      const nav = ref.current;
      const tab = nav.querySelector(".active");
      if (!tab) return;
      const left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      nav.scrollTo({ left: left + tab.offsetWidth / 2 - nav.clientWidth / 2, behavior: "smooth" });
    }, [category]);
    const scroll = (direction) => ref.current.scrollBy({ left: direction * ref.current.clientWidth * 0.7, behavior: "smooth" });

    return html`
      <div className="tabs-wrap">
        ${more.left && html`<button className="more left" aria-label="Earlier tabs" onClick=${() => scroll(-1)}>≪</button>`}
        <nav className="tabs" role="tablist" ref=${ref}>
          ${categories.map((c) => {
            const fresh = c.images.filter((image) => image.isNew).length;
            return html`
              <button
                key=${c.folder}
                role="tab"
                aria-selected=${c === category}
                className=${c === category ? "active" : ""}
                onClick=${(event) => (event.currentTarget.blur(), c !== category && go(c.folder, null))}
              >
                ${c.title}${showCounts && html`<span className="count">${c.images.length}</span>`}
                ${fresh > 0 && html`<span className="fresh" title=${`${fresh} new`}>+${fresh}</span>`}
              </button>
            `;
          })}
        </nav>
        ${more.right && html`<button className="more right" aria-label="Later tabs" onClick=${() => scroll(1)}>≫</button>`}
      </div>
    `;
  }

  function App() {
    const [gallery, setGallery] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [failure, setFailure] = useState(null);
    const [route, go] = useRoute();
    const { selection, toggle, setMany, clear, keepOnly } = useSelection(gallery ? Boolean(gallery.site.rememberSelection) : null);
    const maxBytes = gallery ? gallery.site.maxDownloadMB * 1024 * 1024 : Infinity;
    const phone = useMediaQuery(PHONE_QUERY);

    useEffect(() => {
      // gallery+.jsonc, when it exists, is used instead of gallery.jsonc (generate.py does the same).
      const load = async () => {
        let response = await fetch(OVERRIDE_FILE, { cache: "no-cache" });
        if (!response.ok) response = await fetch(GALLERY_FILE, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalize(parseJsonc(await response.text()));
      };
      load()
        .then((loaded) => {
          track.start(loaded.site.goatcounter);
          if (!loaded.site.rememberSelection) clear(); // batched with setGallery: no frame with the old selection
          setGallery(loaded);
        })
        .catch((error) => setLoadError(String(error.message || error)));
    }, []);

    const allImages = useMemo(() => (gallery ? gallery.categories.flatMap((c) => c.images) : []), [gallery]);
    useEffect(() => {
      if (gallery) keepOnly(new Set(allImages.map((image) => image.id)));
    }, [gallery, allImages, keepOnly]);

    const category = gallery && (gallery.categories.find((c) => c.folder === route.folder) || gallery.categories[0]);
    // A swipe on the page, or ← / → (lightbox closed), goes to the previous/next tab: main glides
    // off the screen (after following the finger, for a swipe) when there is a tab that way (no
    // wrap-around); the new tab then renders in its place, with no animation, and main is put
    // back before that paints (the layout effect). Otherwise main springs back.
    const main = useRef(null);
    const leaving = useRef(false); // main is gliding, or off-screen waiting for the new tab
    const switchTab = (step) => {
      const next = step !== 0 && gallery.categories[gallery.categories.indexOf(category) + step]; // 0: spring back
      leaving.current = true;
      if (next) glide(main.current, -step * main.current.clientWidth, () => go(next.folder, null));
      else glide(main.current, 0, () => (unglide(main.current), (leaving.current = false)));
    };
    const swipeTabs = useSwipe({
      allowed: () => !leaving.current,
      drag: (dx) => follow(main.current, dx),
      end: (dx, far) => (far ? switchTab(dx < 0 ? 1 : -1) : switchTab(0)),
    });
    useLayoutEffect(() => {
      if (leaving.current && main.current) {
        unglide(main.current);
        leaving.current = false;
      }
    }, [category]);
    const openImage = (category && route.file && category.images.find((image) => image.file === route.file)) || null;
    useEffect(() => {
      if (!gallery || openImage) return; // the lightbox has its own ← / →
      const onKey = (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || leaving.current) return;
        if (event.key === "ArrowLeft") switchTab(-1);
        else if (event.key === "ArrowRight") switchTab(1);
        else return;
        event.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    });

    useEffect(() => {
      if (!gallery) return;
      document.title = openImage ? `${openImage.title} – ${gallery.site.title}` : gallery.site.title;
    }, [gallery, openImage]);

    // One page view per tab shown and per image opened (previous/next in the lightbox included).
    const shown = openImage || category;
    useEffect(() => {
      if (!shown) return;
      track.view(openImage ? urlPath(openImage.folder, openImage.file) : urlPath(category.folder), shown.title);
    }, [shown]);

    const open = useCallback((image) => go(image.folder, image.file, { state: { openedHere: true } }), [go]);
    const moveTo = useCallback((image) => go(image.folder, image.file, { replace: true, state: history.state }), [go]);
    const close = useCallback(() => {
      if (history.state && history.state.openedHere) history.back();
      else go(category.folder, null, { replace: true });
    }, [go, category]);

    const download = useCallback(
      async (images, zipName) => {
        if (busy || !images.length) return;
        const size = totalBytes(images);
        if (size > maxBytes) return; // the buttons are hidden then; this is only a safety net
        setFailure(null);
        try {
          await downloadImages(images, zipName, setBusy);
        } catch (error) {
          setFailure(`Download failed: ${error.message || error}`);
          track.error("download", error.message || error);
        }
        setBusy(null);
      },
      [busy]
    );

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
      return html`<main className="message"><h1>${gallery.site.title}</h1><p>There are no images yet.</p></main>`;
    }

    const selected = allImages.filter((image) => selection.has(image.id));
    const selectedHere = category.images.filter((image) => selection.has(image.id)).length;
    const noneHere = selectedHere === 0; // the button selects all of this tab, or deselects all of it as soon as one is selected
    const siteSlug = slug(gallery.site.title);

    // The section controls: the status block and the buttons. In the toolbar on desktop; on
    // phones a bar fixed at the bottom of the screen, rendered after main (main is what the tab
    // swipe moves, and a transformed ancestor would carry a fixed bar along).
    const tooLarge = totalBytes(selected) > maxBytes; // then the message replaces the count and the download button
    const actions = html`
      <div className=${phone ? "actions bar" : "actions"}>
        ${(failure || busy || selected.length > 0) &&
        html`
          <div className="status">
            ${tooLarge && html`<span className="failure">${TOO_LARGE}</span>`}
            ${failure && html`<span className="failure">${failure}</span>`}
            ${busy
              ? html`<span className="muted">${busy}</span>`
              : !tooLarge &&
                selected.length > 0 &&
                html`
                  <span><strong>${plural(selected.length, "image")}</strong> selected</span>
                  ${selected.length > selectedHere && html`<span className="muted">(${selected.length - selectedHere} in other tabs)</span>`}
                `}
          </div>
        `}
        <div className="buttons">
          ${gallery.site.showClearButton && selected.length > 0 && html`<button onClick=${() => (track.clear(), clear())}>Clear</button>`}
          ${tooLarge
            ? null
            : selected.length > 0
            ? html`
                <button className="primary" disabled=${Boolean(busy)} onClick=${() => download(selected, `${siteSlug}-${selected.length}-images.zip`)}>
                  ${downloadLabel(selected)}
                </button>
              `
            : gallery.site.showDownloadAllButton &&
              totalBytes(category.images) <= maxBytes &&
              html`
                <button className="primary" disabled=${Boolean(busy)} onClick=${() => download(category.images, `${slug(category.title)}.zip`)}>
                  ${downloadLabel(category.images, "Download all")}
                </button>
              `}
          <button
            onClick=${() => {
              track.selectAll(category, noneHere);
              setMany(category.images.map((image) => image.id), noneHere);
            }}
          >
            ${noneHere ? "Select all" : "Deselect all"}
          </button>
          ${failure && !busy && html`<button onClick=${() => setFailure(null)}>Dismiss</button>`}
        </div>
      </div>
    `;

    return html`
      <header className="top">
        <img className="logo" src="logo-small-borderless-transparent.png" alt=${gallery.site.title} />
        <${Tabs} categories=${gallery.categories} category=${category} go=${go} showCounts=${gallery.site.showImageCounts} />
      </header>

      <main ref=${main} ...${swipeTabs}>
        <div className="toolbar">
          ${(category.description || gallery.site.description) && html`<p>${category.description || gallery.site.description}</p>`}
          ${!phone && actions}
        </div>

        <div className="grid">
          ${category.images.map(
            (image) => html`<${Tile} key=${image.id} image=${image} selected=${selection.has(image.id)} onToggle=${toggle} onOpen=${open} />`
          )}
        </div>
      </main>
      ${phone && actions}

      ${openImage &&
      html`
        <${Lightbox}
          images=${category.images}
          image=${openImage}
          selected=${selection.has(openImage.id)}
          onToggle=${toggle}
          onMove=${moveTo}
          onClose=${close}
          onDownload=${download}
        />
      `}
    `;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})();
