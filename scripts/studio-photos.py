"""
Turns phone photos into clean catalogue shots: the product is cut out of the
room it was photographed in and set on a soft studio backdrop with a contact
shadow, in a square frame.

    pip install numpy opencv-contrib-python-headless pillow rembg
    python3 scripts/studio-photos.py

The product is not redrawn. Its pixels come from the source photo with two
clean-up passes so it reads as new, and then a global tone pass (a little
lift in the shadows so a black part does not read as a silhouette, mild
contrast and a light sharpen):

  * dust: small bright specks on the dark plastic take the local median, so
    the print-layer texture around them stays (the embossed logo is left out);
  * window: inside the window outline only, water spots go first, then an
    edge-preserving smooth takes out stains and streaks while the frame
    edges and the real reflections stay; dark windows get a faint glare band
    so they read as glass.

Masks are cached in photos/masks/ — the segmentation model is slow and close
to 1 GB, so it only runs for a photo that has no mask yet. Delete a mask to
regenerate it.
"""

import os

import cv2
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

# Per source photo, in source pixels: the window outline (just inside the
# frame), the embossed logo to leave alone, and the glare strength.
CLEANUP = {
    'pro-handle-1.jpg': {
        'window': [(745, 1105), (890, 1095), (700, 1865), (325, 1725)],
        'logo': (750, 900, 1010, 1020),
        'sheen': 0.12,
    },
    'pro-handle-2.jpg': {
        'window': [(950, 935), (1235, 935), (1255, 1200), (1285, 1400), (1292, 1480), (1282, 1560),
                   (1264, 1738), (710, 1740), (708, 1600), (718, 1500), (765, 1400), (845, 1200), (925, 1000)],
        'logo': (930, 720, 1270, 815),
        'sheen': 0.15,
    },
    'pro-handle-3.jpg': {
        # This window already mirrors the bright sky, so no added glare.
        'window': [(1105, 1000), (1290, 975), (1775, 1585), (1450, 1712), (1410, 1650),
                   (1350, 1550), (1280, 1450), (1230, 1350), (1130, 1150)],
        'logo': (965, 850, 1160, 915),
        'sheen': 0,
    },
    'pro-handle-4.jpg': {},
}


def remove_dust(img, mask, logo):
    """Small bright dots on the dark plastic take the local median."""
    L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0]
    tophat = cv2.morphologyEx(L, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
    cand = tophat > 34
    cand &= cv2.medianBlur(L, 31) < 110  # dark plastic only, not metal or glare
    cand &= cv2.erode((mask > 200).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    if logo:
        x0, y0, x1, y1 = logo
        cand[y0:y1, x0:x1] = False

    n, labels, stats, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), 8)
    small = np.zeros(n, bool)
    for i in range(1, n):
        _, _, w, h, area = stats[i]
        small[i] = area <= 70 and max(w, h) <= 12  # dots, not edges or highlight lines
    specks = cv2.dilate(small[labels].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0

    out = img.copy()
    out[specks] = cv2.medianBlur(img, 11)[specks]
    return out


def clean_window(img, outline, sheen):
    """Spots, stains and streaks out of the window; frame edges and reflections stay."""
    m = np.zeros(img.shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array(outline)], 255)

    med = cv2.medianBlur(img, 31)
    spots = (img.max(axis=2).astype(int) - med.max(axis=2).astype(int) > 22) & (m > 0)
    spots = cv2.dilate(spots.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    img = img.copy()
    img[spots] = med[spots]

    smooth = cv2.ximgproc.guidedFilter(img, img, 22, 40.0 ** 2)
    smooth = cv2.ximgproc.guidedFilter(smooth, smooth, 12, 25.0 ** 2)
    a = cv2.GaussianBlur(m, (0, 0), 6).astype(np.float32)[..., None] / 255
    out = img * (1 - a) + smooth * a

    if sheen:
        # A soft diagonal glare band, the way a clean pane catches the light.
        x0, y0, w, h = cv2.boundingRect(np.array(outline))
        yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]].astype(np.float32)
        t = (xx - x0) / w + (yy - y0) / h
        band = np.clip(1 - np.abs(t - 0.55) / 0.22, 0, 1) ** 2 * 0.8 + np.clip(1 - (yy - y0) / h, 0, 1) * 0.35
        out = out + 255 * sheen * (band * a[..., 0])[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def clean(img, mask, filename):
    spec = CLEANUP.get(filename, {})
    bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    bgr = remove_dust(bgr, np.asarray(mask), spec.get('logo'))
    if 'window' in spec:
        bgr = clean_window(bgr, spec['window'], spec['sheen'])
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


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
            out = compose(tone(clean(img, mask, filename)), mask)

            target = os.path.join(dest, f'{index}.webp')
            out.save(target, 'WEBP', quality=90, method=6)
            print(f'{os.path.relpath(target, ROOT)}  {out.width}x{out.height}  '
                  f'{os.path.getsize(target) // 1024} KB')


if __name__ == '__main__':
    main()
