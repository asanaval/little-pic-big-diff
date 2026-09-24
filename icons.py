"""Cuts the megaphone-and-fist icon out of assets/logo-large.png and writes the site's icons:
site/favicon.ico (16, 32, 48 px: the browser tab), site/apple-touch-icon.png (180 px: a phone's
home screen) and site/icon.png (512 px: the link-preview image, see "url" in the gallery file).

The icon is one color (INK) on the logo's white: every pixel becomes INK with an opacity taken
from how dark it is, so the anti-aliased edges stay smooth. It is set on a white rounded square,
so that it also shows on a dark tab strip. Run it again after changing the logo (needs Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
SOURCE = ROOT / "assets" / "logo-large.png"
SITE = ROOT / "site"

SEARCH_BOX = (60, 500, 420, 860)  # the logo's bottom-left corner, around the icon only
INK = (67, 76, 42)  # the logo's dark green
PAPER = 254  # the logo's white (gray level)
MARGIN = 0.1  # clear space around the icon, as a share of the square's side
RADIUS = 0.2  # corner radius of the white square, as a share of its side


def cut_icon():
    """The icon as INK on transparent, trimmed to its outline."""
    gray = Image.open(SOURCE).convert("L").crop(SEARCH_BOX)
    ink_level = sum(INK) / 3  # close enough to the gray level of INK for the opacity scale
    alpha = gray.point(lambda v: max(0, min(255, round((PAPER - v) * 255 / (PAPER - ink_level)))))
    alpha = alpha.crop(alpha.point(lambda v: 255 if v > 24 else 0).getbbox())
    icon = Image.new("RGBA", alpha.size, INK + (0,))
    icon.putalpha(alpha)
    return icon


def square(icon, side, rounded):
    """The icon centered on a white square of `side` px (rounded corners or not)."""
    scale = 4  # drawn larger, then reduced: smooth corners
    big = side * scale
    out = Image.new("RGBA", (big, big), (255, 255, 255, 0))
    radius = round(big * RADIUS) if rounded else 0
    ImageDraw.Draw(out).rounded_rectangle((0, 0, big - 1, big - 1), radius, fill=(255, 255, 255, 255))
    room = big * (1 - 2 * MARGIN)
    fit = min(room / icon.width, room / icon.height)
    sized = icon.resize((round(icon.width * fit), round(icon.height * fit)), Image.LANCZOS)
    out.alpha_composite(sized, ((big - sized.width) // 2, (big - sized.height) // 2))
    return out.resize((side, side), Image.LANCZOS)


def main():
    icon = cut_icon()
    square(icon, 256, True).save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    # iOS rounds the corners itself and shows transparency as black: a plain white square.
    square(icon, 180, False).convert("RGB").save(SITE / "apple-touch-icon.png", optimize=True)
    square(icon, 512, False).convert("RGB").save(SITE / "icon.png", optimize=True)
    print(f"Icon {icon.width}x{icon.height} px cut from {SOURCE.name}: favicon.ico, apple-touch-icon.png, icon.png written.")


if __name__ == "__main__":
    main()
