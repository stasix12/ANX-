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
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'photos', 'source')
MASKS = os.path.join(ROOT, 'photos', 'masks')
PRODUCTS = os.path.join(ROOT, 'public', 'products')

SIZE = 1600
# Share of the frame the product may fill along its longer side.
FILL = 0.84
BACKDROP_CENTER = (252, 252, 253)
BACKDROP_EDGE = (226, 229, 234)

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
        # The table edge shows between the head and the grip; the mask kept it.
        'trim': (880, 780, 1320, 850),
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
    mask = Image.open(path).convert('L')
    trim = CLEANUP.get(filename, {}).get('trim')
    if trim:
        # Warm, wood-coloured pixels inside the box are background, not product.
        x0, y0, x1, y1 = trim
        hsv = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2HSV)[y0:y1, x0:x1]
        wood = (hsv[..., 0] >= 5) & (hsv[..., 0] <= 40) & (hsv[..., 1] >= 14) & (hsv[..., 2] > 110)
        wood = cv2.dilate(wood.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        m = np.asarray(mask).copy()
        box = m[y0:y1, x0:x1]
        box[wood] = 0
        m[y0:y1, x0:x1] = cv2.GaussianBlur(box, (0, 0), 1.5)
        mask = Image.fromarray(m)
    return mask


def decontaminate(img, mask):
    """Edge pixels carry the table's colour; re-estimate the product colour there."""
    from pymatting import estimate_foreground_ml
    small = 0.5  # half resolution is plenty for a colour estimate and 4x faster
    w, h = img.size
    im = np.asarray(img.resize((round(w * small), round(h * small)), Image.LANCZOS)).astype(np.float64) / 255
    a = np.asarray(mask.resize(im.shape[1::-1], Image.LANCZOS)).astype(np.float64) / 255
    fg = estimate_foreground_ml(im, a)
    fg = cv2.resize((np.clip(fg, 0, 1) * 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    # Only the soft edge band takes the estimate; the solid interior keeps its own pixels.
    alpha = np.asarray(mask).astype(np.float32) / 255
    band = np.clip(1 - np.abs(alpha - 0.5) * 2, 0, 1)
    band = cv2.dilate(band, np.ones((9, 9), np.uint8))[..., None]
    out = np.asarray(img).astype(np.float32) * (1 - band) + fg.astype(np.float32) * band
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def enhance(img):
    """Studio finish on the whole frame: richer blacks, local contrast, crisp detail."""
    lab = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0] / 255

    # Clarity: lift midtone local contrast so moulded edges and the grip read.
    L = L + 0.45 * (L - cv2.GaussianBlur(L, (0, 0), 14))
    # Fine detail: knurling, print layers, the logo.
    L = L + 0.70 * (L - cv2.GaussianBlur(L, (0, 0), 1.6))
    L = np.clip(L, 0, 1)
    # Tone: deep but open blacks, a gentle S, and highlights that pop.
    L = L ** 0.97
    L = L + 0.16 * (L - 0.5) * (1 - np.abs(2 * L - 1))
    L = L + 0.10 * np.clip((L - 0.62) / 0.38, 0, 1) ** 1.5
    lab[..., 0] = np.clip(L, 0, 1) * 255

    # Vibrance: the blue line and the brass fitting, not the black plastic.
    chroma = lab[..., 1:] - 128
    boost = 1 + 0.22 * np.clip(1 - np.abs(chroma).max(axis=2, keepdims=True) / 60, 0, 1)
    lab[..., 1:] = 128 + chroma * boost
    out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    return Image.fromarray(out)


def backdrop():
    """Studio sweep: a soft pool of light behind the product falling off to cool grey."""
    y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    d = np.sqrt(((x - SIZE / 2) / 1.15) ** 2 + (y - SIZE * 0.42) ** 2) / (SIZE * 0.72)
    t = np.clip(d, 0, 1)[..., None] ** 1.4
    c = np.array(BACKDROP_CENTER, np.float32) * (1 - t) + np.array(BACKDROP_EDGE, np.float32) * t
    # A faint floor: the lower part of the sweep a touch darker.
    floor = np.clip((y - SIZE * 0.62) / (SIZE * 0.38), 0, 1)[..., None] * 7
    return Image.fromarray(np.clip(c - floor, 0, 255).astype(np.uint8))


def ground_shadows(mask):
    """A contact shadow where the product touches down, and a soft one around it."""
    m = np.asarray(mask).astype(np.float32) / 255
    h, w = m.shape
    rows = np.where(m.max(axis=1) > 0.5)[0]
    top, bottom = rows.min(), rows.max()
    height = bottom - top + 1

    # Contact: only the lowest few percent of the silhouette, nudged down and tightly blurred.
    contact = m.copy()
    contact[: bottom - max(6, int(height * 0.035))] = 0
    contact = np.roll(contact, max(2, int(height * 0.004)), axis=0)
    contact = cv2.GaussianBlur(contact, (0, 0), max(3, height * 0.006))

    # Ambient: the whole silhouette squashed onto the floor line and blurred wide.
    squash = max(8, int(height * 0.10))
    amb = cv2.resize(m, (w, squash), interpolation=cv2.INTER_AREA)
    ambient = np.zeros_like(m)
    y0 = min(h - squash, bottom - int(squash * 0.8))
    ambient[y0:y0 + squash] = amb[: h - y0]
    ambient = cv2.GaussianBlur(ambient, (0, 0), max(10, height * 0.035))

    layer = np.clip(contact * 0.75 + ambient * 0.38, 0, 1)
    return Image.fromarray((layer * 255).astype(np.uint8))


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
    full = Image.new('L', (SIZE, SIZE), 0)
    full.paste(mask, (x, y))
    canvas.paste(Image.new('RGB', (SIZE, SIZE), (16, 18, 24)), mask=ground_shadows(full))
    canvas.paste(img, (x, y), mask)
    return canvas


def main():
    for slug, gallery in GALLERIES.items():
        dest = os.path.join(PRODUCTS, slug)
        os.makedirs(dest, exist_ok=True)

        for index, filename in enumerate(gallery, 1):
            img = ImageOps.exif_transpose(Image.open(os.path.join(SOURCE, filename))).convert('RGB')
            mask = load_mask(filename, img)
            out = compose(enhance(decontaminate(clean(img, mask, filename), mask)), mask)

            target = os.path.join(dest, f'{index}.webp')
            out.save(target, 'WEBP', quality=90, method=6)
            print(f'{os.path.relpath(target, ROOT)}  {out.width}x{out.height}  '
                  f'{os.path.getsize(target) // 1024} KB')


if __name__ == '__main__':
    main()
