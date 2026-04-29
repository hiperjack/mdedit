"""Make the white background of icon.png transparent.

Flood-fills from the four corners with a tolerance so that anti-aliased pixels
between the rounded square and the background become semi-transparent rather
than leaving a hard white halo.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "icon.png"
DST = SRC  # overwrite in place

# Distance from pure white below which a pixel is treated as background.
WHITE_TOLERANCE = 24  # 0..255


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    assert pixels is not None

    visited = bytearray(width * height)
    stack: list[tuple[int, int]] = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]

    def is_white(r: int, g: int, b: int) -> bool:
        return (
            (255 - r) <= WHITE_TOLERANCE
            and (255 - g) <= WHITE_TOLERANCE
            and (255 - b) <= WHITE_TOLERANCE
        )

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        idx = y * width + x
        if visited[idx]:
            continue
        r, g, b, _a = pixels[x, y]
        if not is_white(r, g, b):
            continue
        visited[idx] = 1
        # Compute alpha based on how far this pixel is from pure white.
        # Pure white -> alpha 0, near-white edge pixel -> partial alpha.
        diff = max(255 - r, 255 - g, 255 - b)
        alpha = int(round(diff * 255 / WHITE_TOLERANCE)) if diff > 0 else 0
        if alpha > 255:
            alpha = 255
        pixels[x, y] = (r, g, b, alpha)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    img.save(DST)
    print(f"saved: {DST} ({width}x{height})")


if __name__ == "__main__":
    main()
