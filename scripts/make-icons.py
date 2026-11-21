"""Draws the extension icons (dev-time only): python scripts/make-icons.py

A blue rounded square with three white rising bars ("trends over time"),
rendered at 8x and downsampled for clean edges at 16/32/48/128 px.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "icons"
BLUE = (9, 105, 218, 255)
WHITE = (255, 255, 255, 255)


def icon(size: int) -> Image.Image:
    s = size * 8
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)
    # three rising bars
    base = s * 0.78
    w = s * 0.16
    gap = s * 0.07
    x0 = (s - (3 * w + 2 * gap)) / 2
    for i, h in enumerate((0.26, 0.40, 0.56)):
        x = x0 + i * (w + gap)
        d.rounded_rectangle([x, base - s * h, x + w, base], radius=int(w * 0.25), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for n in (16, 32, 48, 128):
        icon(n).save(OUT / f"icon-{n}.png")
        print("wrote", OUT / f"icon-{n}.png")
