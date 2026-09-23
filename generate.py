"""Scans site/images/<category folder>/ and updates site/gallery.jsonc and thumbnails.

See CLAUDE.md for the rules (what is preserved, what is commented out).
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).parent
SITE = ROOT / "site"
IMAGES = SITE / "images"
THUMBS = SITE / "thumbs"
# gallery+.jsonc, when it exists, is used instead of gallery.jsonc (by this script and the site).
GALLERY = SITE / "gallery+.jsonc" if (SITE / "gallery+.jsonc").exists() else SITE / "gallery.jsonc"

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
# Images are expected to be 1283 x 1761 (short side x long side). An image within RATIO_TOLERANCE
# of that ratio is resized in place to exactly that ratio; one further off is left alone and its
# thumbnail (always stretched to the card box) is labeled "Incorrect Ratio". The card box and
# the thumbnails are 306:420, the same ratio to within 0.001 % (420 long -> 306 short).
RATIO = (1283, 1761)  # short side, long side
RATIO_TOLERANCE = 0.005
DEFAULT_SITE = {
    "title": "Little pic, big diff",
    "description": "",
    "addNewImages": "bottom",
    "thumbSize": 420,
    "goatcounter": "",  # "https://<code>.goatcounter.com/count" switches usage counting on
    "showClearButton": False,  # the toolbar's Clear (drops the whole selection)
    "showDownloadAllButton": False,  # the toolbar's Download all (the tab's images, when nothing is selected)
    "rememberSelection": False,  # keep the selection across reloads (localStorage); False: a reload unselects all
}
DELETED_MARK = "[deleted]"
# An image line that is commented out: by this script ("// [deleted] {...},") or by hand ("// {...},").
COMMENTED_IMAGE = re.compile(r"^(\s*)//\s*(\[deleted\])?\s*(\{.*\})\s*,?\s*$")
FIRST_KEYS = ("file", "title", "tags", "added")
LAST_KEYS = ("w", "h", "bytes")
STATE = "__state"

Image.MAX_IMAGE_PIXELS = None


def strip_jsonc(text):
    """Removes // and /* */ comments and trailing commas, leaving strings untouched."""
    out = []
    i, n = 0, len(text)
    in_string = False
    while i < n:
        c = text[i]
        if in_string:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 1
            elif c == '"':
                in_string = False
        elif c == '"':
            in_string = True
            out.append(c)
        elif text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        elif c in "}]":
            last = len(out) - 1
            while last >= 0 and out[last].isspace():
                last -= 1
            if last >= 0 and out[last] == ",":
                del out[last]  # whitespace stays, so error line numbers match the file
            out.append(c)
        else:
            out.append(c)
        i += 1
    return "".join(out)


def load_gallery():
    """The parsed file, or None when it does not exist or is empty (a fresh start)."""
    if not GALLERY.exists() or not GALLERY.read_text(encoding="utf-8").strip():
        return None
    lines = []
    for line in GALLERY.read_text(encoding="utf-8").splitlines():
        match = COMMENTED_IMAGE.match(line)
        if match:
            try:
                entry = json.loads(match.group(3))
            except ValueError:
                entry = None
            if isinstance(entry, dict) and "file" in entry:
                entry[STATE] = "deleted" if match.group(2) else "commented"
                line = match.group(1) + json.dumps(entry, ensure_ascii=False) + ","
        lines.append(line)
    try:
        return json.loads(strip_jsonc("\n".join(lines)))
    except ValueError as error:
        sys.exit(f"{GALLERY.name} is not valid: {error}\nNothing was changed. Fix that line and run again.")


def default_title(stem):
    words = re.sub(r"[_\-\s]+", " ", stem).strip().split(" ")
    return " ".join(w.capitalize() if w.islower() else w for w in words)


def ordered(entry):
    keys = [k for k in FIRST_KEYS if k in entry]
    keys += [k for k in entry if k not in FIRST_KEYS and k not in LAST_KEYS and k != STATE]
    keys += [k for k in LAST_KEYS if k in entry]
    return {k: entry[k] for k in keys}


def derived_path(base, folder, file):
    return base / folder / (file + ".webp")


def box_for(width, height):
    """The exact card ratio for this orientation and how far the image is from it (0 = exact)."""
    short, long = RATIO
    box = (long, short) if width >= height else (short, long)
    return box, abs((width / height) / (box[0] / box[1]) - 1)


def exact_size(width, height):
    """The size at the exact ratio that keeps the image's long side."""
    (bw, bh), _ = box_for(width, height)
    if width >= height:
        return width, round(width * bh / bw)
    return round(height * bw / bh), height


def opened(source):
    """The image, loaded and detached from the file, with its EXIF rotation applied (so
    width/height are as displayed). `format` and `frames` are carried over from the file."""
    with Image.open(source) as img:
        img.load()
        out = ImageOps.exif_transpose(img)
        out.format = img.format
        out.frames = getattr(img, "n_frames", 1)
        return out


def fix_ratio(source):
    """Resizes the file in place to the exact ratio (its long side is kept) when it is within
    RATIO_TOLERANCE of it. Returns "exact", "fixed", "off" (too far, left alone) or "skipped"."""
    with opened(source) as img:
        width, height = img.size
        _, off = box_for(width, height)
        if off == 0 or exact_size(width, height) == (width, height):
            return "exact"
        if off > RATIO_TOLERANCE:
            return "off"
        if img.format == "GIF" or img.frames > 1:
            return "skipped"
        fmt = img.format
        img = img.resize(exact_size(width, height), Image.LANCZOS)
        icc = img.info.get("icc_profile")
        temp = source.with_name(source.name + ".tmp")
        if fmt == "JPEG":
            img.save(temp, fmt, quality=95, subsampling=0, icc_profile=icc)
        elif fmt == "WEBP":
            img.save(temp, fmt, quality=95, method=6, icc_profile=icc)
        else:
            img.save(temp, fmt, icc_profile=icc)
    temp.replace(source)
    return "fixed"


def label_font(size):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def save_thumbnail(source, target, size, quality, off):
    """Writes the thumbnail stretched to the exact card box (`size` = long side). An image whose
    ratio is off gets a big red "Incorrect Ratio" label on white in the middle."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with opened(source) as img:
        (bw, bh), _ = box_for(*img.size)
        box = (size, round(size * bh / bw)) if bw >= bh else (round(size * bw / bh), size)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.mode or "transparency" in img.info else "RGB")
        img = img.resize(box, Image.LANCZOS)
        if off:
            draw = ImageDraw.Draw(img)
            font = label_font(max(12, box[0] // 9))
            text = "Incorrect Ratio"
            x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
            pad = font.size // 2
            w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
            left, top = (box[0] - w) // 2, (box[1] - h) // 2
            draw.rectangle((left, top, left + w, top + h), fill="white", outline="red", width=2)
            draw.text((left + pad - x0, top + pad - y0), text, fill="red", font=font)
        img.save(target, "WEBP", quality=quality, method=6)


def update_image(folder, entry, site, counts):
    """Fixes the file's ratio when needed, refreshes w/h/bytes and the thumbnail.
    Returns True when a thumbnail was made."""
    source = IMAGES / folder / entry["file"]
    result = fix_ratio(source)
    if result == "fixed":
        counts["fixed"] += 1
        print(f"Resized to exact ratio: {folder}/{entry['file']}")
    elif result == "off":
        counts["off"] += 1
        print(f"INCORRECT RATIO (left as is, thumbnail labeled): {folder}/{entry['file']}")
    stat = source.stat()
    thumb = derived_path(THUMBS, folder, entry["file"])
    stale = not thumb.exists() or thumb.stat().st_mtime < stat.st_mtime
    if stale or entry.get("bytes") != stat.st_size or "w" not in entry or "h" not in entry:
        with opened(source) as img:
            entry["w"], entry["h"] = img.size
        entry["bytes"] = stat.st_size
    if stale:
        save_thumbnail(source, thumb, site["thumbSize"], 82, result == "off")
    return stale


def remove_orphans(base, keep):
    if not base.exists():
        return 0
    removed = 0
    for path in base.rglob("*.webp"):
        if path not in keep:
            path.unlink()
            removed += 1
    for folder in sorted((p for p in base.rglob("*") if p.is_dir()), reverse=True):
        if not any(folder.iterdir()):
            folder.rmdir()
    return removed


def render(gallery):
    dump = lambda value: json.dumps(value, ensure_ascii=False)
    lines = [
        "// Rewritten by generate.py. Yours to edit: site settings, category order/title/description/hidden,",
        "// image order/title/tags. One image per line; every image line ends with a comma.",
        '// "// [deleted] {...}" = file is gone (comes back when the file does). "// {...}" = hidden by you.',
        "{",
        '  "site": {',
    ]
    site = gallery["site"]
    lines += [f"    {dump(k)}: {dump(v)}," for k, v in site.items()]
    lines += ["  },", '  "categories": [']
    for category in gallery["categories"]:
        lines.append("    {")
        for key, value in category.items():
            if key != "images":
                lines.append(f"      {dump(key)}: {dump(value)},")
        lines.append('      "images": [')
        for entry in category["images"]:
            state = entry.get(STATE)
            prefix = {"deleted": f"// {DELETED_MARK} ", "commented": "// "}.get(state, "")
            lines.append(f"        {prefix}{dump(ordered(entry))},")
        lines += ["      ],", "    },"]
    lines += ["  ],", "}", ""]
    return "\n".join(lines)


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    gallery = load_gallery()
    first_run = gallery is None
    gallery = gallery or {}
    site = gallery["site"] = {**DEFAULT_SITE, **gallery.get("site", {})}
    categories = gallery.setdefault("categories", [])
    today = date.today().isoformat()
    counts = {"added": 0, "deleted": 0, "restored": 0, "resized": 0, "fixed": 0, "off": 0}

    known_folders = {c["folder"] for c in categories}
    for folder in sorted(p.name for p in IMAGES.iterdir() if p.is_dir()):
        if folder not in known_folders:
            categories.append({"folder": folder, "title": default_title(folder), "description": "", "images": []})
            print(f"New category: {folder}")

    keep = set()
    for category in categories:
        folder = category["folder"]
        entries = category.setdefault("images", [])
        path = IMAGES / folder
        on_disk = {}
        if path.is_dir():
            on_disk = {p.name: p for p in path.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS}

        for entry in entries:
            exists = entry["file"] in on_disk
            state = entry.get(STATE)
            if state == "commented":
                continue
            if state == "deleted" and exists:
                del entry[STATE]
                counts["restored"] += 1
                print(f"Restored: {folder}/{entry['file']}")
            elif state is None and not exists:
                entry[STATE] = "deleted"
                counts["deleted"] += 1
                print(f"Deleted:  {folder}/{entry['file']}")

        listed = {e["file"] for e in entries}
        fresh = []
        for name in sorted(set(on_disk) - listed, key=str.lower):
            added = date.fromtimestamp(on_disk[name].stat().st_mtime).isoformat() if first_run else today
            fresh.append({"file": name, "title": default_title(Path(name).stem), "tags": [], "added": added})
            counts["added"] += 1
            print(f"Added:    {folder}/{name}")
        category["images"] = entries = fresh + entries if site["addNewImages"] == "top" else entries + fresh

        for entry in entries:
            if STATE in entry:
                continue
            try:
                counts["resized"] += update_image(folder, entry, site, counts)
            except Exception as error:  # unreadable image: keep it out of the site, keep the line
                entry[STATE] = "commented"
                print(f"UNREADABLE, hidden: {folder}/{entry['file']} ({error})")
                continue
            keep.add(derived_path(THUMBS, folder, entry["file"]))

    orphans = remove_orphans(THUMBS, keep)

    text = render(gallery)
    if first_run or GALLERY.read_text(encoding="utf-8") != text:
        with open(GALLERY, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)

    shown = sum(1 for c in categories for e in c["images"] if STATE not in e)
    print(f"{GALLERY.name}: ", end="")
    print(
        f"{shown} images in {len(categories)} categories. "
        f"Added {counts['added']}, deleted {counts['deleted']}, restored {counts['restored']}, "
        f"thumbnails made for {counts['resized']}, orphan files removed {orphans}, "
        f"files resized to the exact ratio {counts['fixed']}, incorrect ratio {counts['off']}."
    )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
