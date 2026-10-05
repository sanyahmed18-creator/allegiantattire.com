#!/usr/bin/env python3
"""Turn the raw studio shots in ./raw into rail assets.

    python3 tools/build-garments.py

For every raw/<type>-<side>.png (side|front) it:
  1. keys the flat magenta backdrop to transparency (with spill removal),
  2. trims to the garment and normalises the height,
  3. builds colourways by mapping the shading of the original onto new
     garment colours (so one render yields a whole rail of colours),
  4. writes assets/garments/<type>-<side>[-<colourway>].png plus a
     garments.json manifest with each artwork's aspect ratio.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter

RAW, OUT = "raw", "assets/garments"
KEY = (255, 0, 255)           # magenta backdrop
HEIGHT = 760                  # normalised height (2x a ~380px rail piece)
BG_LO, BG_HI = 30, 150        # magenta-ness ramp: <=LO garment, >=HI backdrop

# colourways per garment type (first one = the colour in the render)
COLOURWAYS = {
    "tee":    [None, (150, 44, 34), (26, 26, 28), (198, 190, 176), (58, 74, 62)],
    "hoodie": [None, (222, 216, 205), (34, 62, 48), (92, 32, 40)],
    "polo":   [None, (238, 236, 229), (30, 32, 38), (150, 40, 34), (52, 84, 120)],
    "tank":   [None, (232, 228, 219), (30, 34, 40)],
    "active": [None, (28, 30, 34), (60, 90, 130), (206, 200, 188)],
    "cap":    [None, (226, 220, 208), (32, 34, 38), (46, 90, 60)],
    "coverall": [None, (206, 96, 32), (36, 38, 44), (206, 200, 188)],
    "shirt":  [None, (216, 220, 226), (28, 30, 36), (150, 40, 34)],
}
COLOUR_NAME = {
    (152, 30, 38): "rust", (26, 26, 28): "black", (196, 152, 178): "blush",
    (58, 74, 62): "moss", (222, 216, 205): "ecru", (34, 62, 48): "forest",
    (92, 32, 40): "oxblood", (238, 236, 229): "chalk", (30, 32, 38): "ink",
    (150, 40, 34): "red", (52, 84, 120): "steel", (232, 228, 219): "chalk",
    (28, 30, 34): "black", (60, 90, 130): "blue", (206, 200, 188): "sand",
    (226, 220, 208): "ecru", (32, 34, 38): "ink", (46, 90, 60): "green",
    (198, 190, 176): "sand",
    (206, 96, 32): "orange", (36, 38, 44): "ink", (216, 220, 226): "white",
    (28, 30, 36): "ink",
}


def key_out(img):
    """magenta backdrop -> alpha.

    Edge pixels are not just un-mixed (that leaves a coloured fringe), they are
    repainted with the nearest solid garment pixel, which is what a proper key
    does: the outline stays truthful, but no magenta or green survives on it.
    """
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    score = np.minimum(r, b) - g                      # ~255 on the backdrop
    alpha = 1.0 - (score - BG_LO) / float(BG_HI - BG_LO)
    alpha = np.clip(alpha, 0.0, 1.0)

    solid = alpha >= 0.995                            # trustworthy garment pixels
    # grow the solid colours outwards, one ring at a time, until the soft edge
    # is covered — this replaces fringe pixels with real fabric colour
    colour = rgb.copy()
    known = solid.copy()
    for _ in range(10):
        if known.all():
            break
        grown = known.copy()
        shifted = [np.roll(np.roll(known, dy, 0), dx, 1)
                   for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))]
        grow_to = np.logical_and(np.logical_not(known), np.any(shifted, axis=0))
        if not grow_to.any():
            break
        acc = np.zeros_like(colour)
        cnt = np.zeros(known.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            src = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(colour, dy, 0), dx, 1) * src[..., None]
            cnt += src
        avg = np.divide(acc, np.maximum(cnt, 1)[..., None])
        colour = np.where(grow_to[..., None], avg, colour)
        known = np.logical_or(known, grow_to)

    rgba = np.concatenate([np.clip(colour, 0, 255), (alpha * 255)[..., None]], axis=2)
    rgba[alpha <= 0.02] = 0
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def trim(img, pad=14):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


def normalise(img):
    """fit every artwork to the same height so pieces hang to a common length"""
    scale = HEIGHT / img.height
    return img.resize((max(1, int(round(img.width * scale))), HEIGHT), Image.LANCZOS)


def recolour(img, rgb):
    """keep the render's shading, swap the garment colour"""
    if rgb is None:
        return img
    arr = np.asarray(img, dtype=np.float32)
    lum = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(0.4)), dtype=np.float32) / 255.0
    # normalise the shading so the new colour keeps the same brightness range
    lo, hi = np.percentile(lum[arr[..., 3] > 8], (2, 98))
    k = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1.25) ** 1.15
    tint = np.array(rgb, dtype=np.float32) * 1.06          # lift so folds stay visible
    arr[..., :3] = np.clip(tint[None, None, :] * k[..., None], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for f in sorted(os.listdir(RAW)):
        if not f.endswith(".png"):
            continue
        stem = f[:-4]
        if "-" not in stem:
            continue
        gtype, side = stem.rsplit("-", 1)
        if side not in ("side", "front"):
            continue
        base = normalise(trim(key_out(Image.open(os.path.join(RAW, f)))))
        ways = COLOURWAYS.get(gtype, [None])
        for i, rgb in enumerate(ways):
            art = recolour(base, rgb)
            name = f"{gtype}-{side}{'' if i == 0 else '-' + COLOUR_NAME.get(rgb, str(i))}.webp"
            art.save(os.path.join(OUT, name), "WEBP", quality=84, method=6)
            manifest.setdefault(gtype, {}).setdefault(side, []).append(
                {"file": name, "w": art.width, "h": art.height})
        print(f"{stem:14s} → {len(ways)} colourway(s)  {base.width}x{base.height}")
    with open(os.path.join(OUT, "garments.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("manifest:", os.path.join(OUT, "garments.json"))


if __name__ == "__main__":
    main()
