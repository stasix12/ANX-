"""
Turns phone photos into clean catalogue shots: the product is cut out of the
room it was photographed in and set on a soft studio backdrop with a contact
shadow, in a square frame.

    pip install numpy opencv-python-headless pillow rembg
    python3 scripts/studio-photos.py

The product itself is not redrawn or retouched. Its pixels come straight from
the source photo; the only change to them is a global tone pass (a little
lift in the shadows so a black part does not read as a silhouette, mild
contrast and a light sharpen) that applies to the whole frame equally.

Masks are cached in photos/masks/ — the segmentation model is slow and close
to 1 GB, so it only runs for a photo that has no mask yet. Delete a mask to
regenerate it.
"""

import os

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'photos', 'source')
MASKS = os.path.join(ROOT, 'photos', 'masks')
PRODUCTS = os.path.join(ROOT, 'public', 'products')

SIZE = 1600
# Share of the frame the product may fill along its longer side.
FILL = 0.84
BACKDROP_CENTER = (250, 250, 251)
BACKDROP_EDGE = (232, 234, 237)

# Per product slug, the gallery in order. The first entry is the catalogue card.
GALLERIES = {
    # Three-quarter view first, then front, the other side, and the profile.
    'anx-pro-handle': [
        'pro-handle-1.jpg', 'pro-handle-2.jpg',
        'pro-handle-3.jpg', 'pro-handle-4.jpg',
    ],
}


def load_mask(filename, img):
    os.makedirs(MASKS, exist_ok=True)
    path = os.path.join(MASKS, os.path.splitext(filename)[0] + '.png')
    if not os.path.exists(path):
        from rembg import new_session, remove
        session = new_session('birefnet-general')
        remove(img, session=session, only_mask=True).save(path)
    return Image.open(path).convert('L')


def tone(img):
    """Same global curve on every pixel: lift shadows, mild S-curve, sharpen."""
    a = np.asarray(img).astype(np.float32) / 255
    a = a ** 0.88
    a = a + 0.10 * (a - 0.5) * (1 - np.abs(2 * a - 1))
    a = np.clip(a, 0, 1)
    out = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    return out.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))


def backdrop():
    """Soft radial falloff from near-white in the middle to light grey."""
    y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    d = np.sqrt((x - SIZE / 2) ** 2 + (y - SIZE * 0.45) ** 2) / (SIZE * 0.75)
    t = np.clip(d, 0, 1)[..., None] ** 1.6
    c = np.array(BACKDROP_CENTER, np.float32) * (1 - t) + np.array(BACKDROP_EDGE, np.float32) * t
    return Image.fromarray(c.astype(np.uint8))


def shadow(mask, offset, blur, opacity):
    layer = Image.new('L', (SIZE, SIZE), 0)
    layer.paste(mask, offset)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer.point(lambda v: int(v * opacity))


def compose(img, mask):
    box = mask.point(lambda v: 255 if v > 20 else 0).getbbox()
    # A product that runs out of the source frame keeps running out of ours,
    # so the cut lands on the canvas edge instead of floating mid-backdrop.
    edge = 4
    cut_left, cut_top = box[0] <= edge, box[1] <= edge
    cut_right, cut_bottom = box[2] >= img.width - edge, box[3] >= img.height - edge
    img, mask = img.crop(box), mask.crop(box)

    scale = SIZE * FILL / max(img.size)
    if cut_left and cut_right:
        scale = SIZE / img.width
    elif cut_top and cut_bottom:
        scale = SIZE / img.height
    size = (round(img.width * scale), round(img.height * scale))
    img = img.resize(size, Image.LANCZOS)
    mask = mask.resize(size, Image.LANCZOS)

    x = 0 if cut_left else SIZE - size[0] if cut_right else (SIZE - size[0]) // 2
    y = 0 if cut_top else SIZE - size[1] if cut_bottom else (SIZE - size[1]) // 2
    canvas = backdrop()
    dark = Image.new('RGB', (SIZE, SIZE), (20, 22, 26))
    # A wide soft ambient shadow and a tight contact shadow underneath.
    canvas.paste(dark, mask=shadow(mask, (x, y + 28), 40, 0.22))
    canvas.paste(dark, mask=shadow(mask, (x, y + 8), 8, 0.30))
    canvas.paste(img, (x, y), mask)
    return canvas


def main():
    for slug, gallery in GALLERIES.items():
        dest = os.path.join(PRODUCTS, slug)
        os.makedirs(dest, exist_ok=True)

        for index, filename in enumerate(gallery, 1):
            img = ImageOps.exif_transpose(Image.open(os.path.join(SOURCE, filename))).convert('RGB')
            mask = load_mask(filename, img)
            out = compose(tone(img), mask)

            target = os.path.join(dest, f'{index}.webp')
            out.save(target, 'WEBP', quality=90, method=6)
            print(f'{os.path.relpath(target, ROOT)}  {out.width}x{out.height}  '
                  f'{os.path.getsize(target) // 1024} KB')


if __name__ == '__main__':
    main()
