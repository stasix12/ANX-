"""
Illustrative product imagery for the /shop cleaning-equipment catalogue,
cut from the approved design reference (the mock-up with ANACONDA, Wand of
Troy, the 360° connector, …). UI chrome baked into the mock-up (hearts,
arrows, the "1/6" counter, tile labels) is inpainted away and the crops are
upscaled 2x. The orange label on the pump box is re-tinted to brand blue.

These are renders from the mock-up, not photos of the real products: the
store marks them "תמונה להמחשה" until studio photos replace them (same
file names, or upload in /shop/admin). Real photos already in the repo
(public/products/anx-anaconda*, anx-hose-clips) are used as-is.

  python3 scripts/shop-images-cleaning.py <reference.png>
"""
import os, sys
import cv2
import numpy as np

R = cv2.imread(sys.argv[1])
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'shop', 'img2')
os.makedirs(OUT, exist_ok=True)

def crop(x0, y0, x1, y1, inset=3):
    return R[y0 + inset:y1 - inset, x0 + inset:x1 - inset].copy(), inset

def inpaint(img, circles=(), rects=()):
    m = np.zeros(img.shape[:2], np.uint8)
    for cx, cy, r in circles:
        cv2.circle(m, (int(cx), int(cy)), int(r), 255, -1)
    for x0, y0, x1, y1 in rects:
        cv2.rectangle(m, (int(x0), int(y0)), (int(x1), int(y1)), 255, -1)
    return cv2.inpaint(img, m, 6, cv2.INPAINT_TELEA)

def no_orange(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int16)
    o = (hsv[..., 0] >= 5) & (hsv[..., 0] <= 28) & (hsv[..., 1] > 110)
    hsv[..., 0] = np.where(o, 113, hsv[..., 0])
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

def save(img, name, scale=2.0, sharpen=0.6):
    h, w = img.shape[:2]
    big = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    blur = cv2.GaussianBlur(big, (0, 0), 1.4)
    big = cv2.addWeighted(big, 1 + sharpen, blur, -sharpen, 0)
    cv2.imwrite(os.path.join(OUT, name + '.webp'), big, [cv2.IMWRITE_WEBP_QUALITY, 90])

def card(box, heart, name, scale=2.5, fix=None):
    img, i = crop(*box)
    hx, hy, hr = heart
    img = inpaint(img, circles=[(hx - box[0] - i, hy - box[1] - i, hr + 5)])
    if fix:
        img = fix(img)
    save(img, name, scale)

def tile(box, name, fix=None):
    img, i = crop(*box)
    h, w = img.shape[:2]
    img = inpaint(img, rects=[(4, h - 36, w - 4, h - 4)])
    if fix:
        img = fix(img)
    save(img, name, 2.5)

# Hero visual (banner handle) — the copy on the right is live text.
hero, _ = crop(12, 72, 166, 282)
hero = inpaint(hero, rects=[(143, 55, 160, 135)])  # last letters of the mock-up's headline
save(hero, 'hero-handle', 2.5)

# Product page gallery of the mock-up handle.
pdp, i = crop(989, 62, 1285, 237)
pdp = inpaint(pdp, circles=[(268 - i, 23 - i, 16), (23 - i, 96 - i, 15), (270 - i, 96 - i, 15)], rects=[(249 - i, 150 - i, 287, 172)])
save(pdp, 'handle-render-1', 2.2)

# Catalogue / favourites cards.
card((836, 373, 963, 485), (851, 388, 12), 'connector-360')
card((267, 874, 382, 946), (277, 888, 10), 'crevice-head')
card((395, 874, 511, 946), (405, 888, 10), 'shurflo-box-render', fix=no_orange)

# Category tiles (also the main shot of products in that aisle).
tile((379, 108, 519, 247), 'cat-handles')
tile((528, 108, 664, 247), 'cat-wands')
tile((379, 256, 519, 394), 'cat-adapters')
tile((528, 256, 664, 394), 'cat-suction')
tile((379, 402, 519, 542), 'cat-accessories', fix=no_orange)
tile((528, 402, 664, 542), 'cat-parts')
print('ok', sorted(os.listdir(OUT)))

# CAD renders of ANX3D's own designs (stl/), cropped from the preview sheets.
def cad(path, box, name):
    img = cv2.imread(os.path.join(os.path.dirname(__file__), '..', path))
    x0, y0, x1, y1 = box
    c = no_orange(img[y0:y1, x0:x1])
    h, w = c.shape[:2]
    side = max(h, w)
    canvas = np.full((side, side, 3), 255, np.uint8)
    canvas[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = c
    cv2.imwrite(os.path.join(OUT, name + '.webp'), cv2.resize(canvas, (900, 900), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 90])

cad('stl/shurflo_box/preview.png', (20, 60, 560, 520), 'shurflo-box-cad')
cad('stl/shurflo_box/preview.png', (1130, 60, 1680, 520), 'shurflo-box-cad-open')
cad('stl/preview.png', (20, 545, 1530, 835), 'wand-tubes-cad')
cad('stl/preview.png', (0, 1060, 1800, 1500), 'wand-tubes-parts-cad')
