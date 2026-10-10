"""Inspect PNG transparency and render it on a checkerboard (no network requests)."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw


def main(path):
    path = Path(path)
    if not path.is_file():
        print(f"ERROR: FILE_NOT_FOUND: {path}")
        return 2
    with Image.open(path) as raw:
        raw.load()
        img = raw.convert("RGBA")
        has_alpha = "A" in raw.getbands() or "transparency" in raw.info
        alpha = np.asarray(img.getchannel("A"), dtype=np.uint8)
        print(f"IMAGE_SIZE: {raw.width}x{raw.height}")
        print(f"IMAGE_MODE: {raw.mode}")
        print(f"ALPHA_PRESENT: {'YES' if has_alpha else 'NO'}")
        print(f"ALPHA_RANGE: {int(alpha.min())}..{int(alpha.max())}")
        print(f"ALPHA_TRANSPARENT_PCT: {np.mean(alpha <= 8) * 100:.2f}%")
        print(f"ALPHA_SEMITRANSPARENT_PCT: {np.mean((alpha > 8) & (alpha < 247)) * 100:.2f}%")
        print(f"ALPHA_OPAQUE_PCT: {np.mean(alpha >= 247) * 100:.2f}%")
        tile = max(8, min(24, min(raw.size) // 12))
        canvas = Image.new("RGB", img.size, (230, 230, 230))
        draw = ImageDraw.Draw(canvas)
        for y in range(0, raw.height, tile):
            for x in range(0, raw.width, tile):
                if ((x // tile) + (y // tile)) % 2 == 1:
                    draw.rectangle((x, y, min(x + tile - 1, raw.width - 1), min(y + tile - 1, raw.height - 1)), fill=(165, 165, 165))
        canvas.paste(img, (0, 0), img.getchannel("A"))
        output = path.with_name(path.stem + "_checkerboard.png")
        canvas.save(output)
        print(f"CHECKERBOARD_PREVIEW: {output}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python tools/check_alpha.py <PNG-file>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
