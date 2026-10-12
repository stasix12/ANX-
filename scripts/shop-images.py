"""
Builds the ANX3D /shop product imagery from the approved design reference.

The reference mockups are the only product photography that exists so far,
so each product shot is cut out of them, the UI chrome baked into the mockup
(heart buttons, gallery arrows, the "1/6" counter, tile labels) is inpainted
away, and the result is upscaled 2x. Color variants of the flex dragon are
derived by re-tinting its blue plastic. Replace these files with real studio
photos (same names) whenever they exist.

  python3 scripts/shop-images.py <reference-1.png> <reference-2.png>
"""
import sys, os
import cv2
import numpy as np

A = cv2.imread(sys.argv[1])
B = cv2.imread(sys.argv[2])
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'shop', 'img')
os.makedirs(OUT, exist_ok=True)

def crop(src, x0, y0, x1, y1):
    return src[y0:y1, x0:x1].copy()

def inpaint(img, circles=(), rects=()):
    mask = np.zeros(img.shape[:2], np.uint8)
    for (cx, cy, r) in circles:
        cv2.circle(mask, (cx, cy), r, 255, -1)
    for (x0, y0, x1, y1) in rects:
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, -1)
    return cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)

def finish(img, name, scale=2.0, sharpen=0.6):
    h, w = img.shape[:2]
    big = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    blur = cv2.GaussianBlur(big, (0, 0), 1.4)
    big = cv2.addWeighted(big, 1 + sharpen, blur, -sharpen, 0)
    cv2.imwrite(os.path.join(OUT, name + '.webp'), big, [cv2.IMWRITE_WEBP_QUALITY, 90])
    return big

def card(src, x0, y0, x1, y1, heart=True, inset=4):
    img = crop(src, x0 + inset, y0 + inset, x1 - inset, y1 - inset)
    if heart:
        img = inpaint(img, circles=[(22 - inset, 24 - inset, 17)])
    return img

def retint(img, hue_shift=None, desaturate=False):
    """Re-color the saturated blue plastic, leaving black parts and the set alone."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int16)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    blue = ((h > 95) & (h < 135) & (s > 70)).astype(np.float32)
    blue = cv2.GaussianBlur(blue, (0, 0), 0.8)
    out = hsv.copy()
    if hue_shift is not None:
        out[..., 0] = np.where(blue > 0.5, hue_shift(h), h)
    if desaturate:
        out[..., 1] = (s * (1 - blue * 0.92)).astype(np.int16)
        out[..., 2] = (v * (1 - blue * 0.55)).astype(np.int16)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_HSV2BGR)

# ---- Flex dragon gallery (product page) --------------------------------
main = crop(B, 1074, 131, 1503, 399)
main = inpaint(main,
               circles=[(402 - 3, 33 - 3, 24), (26 - 3, 146 - 3, 21), (408 - 3, 146 - 3, 21)],
               rects=[(370 - 3, 236 - 3, 428, 270)])
finish(main, 'dragon-blue-1')
finish(retint(main, hue_shift=lambda h: h - 50), 'dragon-green-1')
finish(retint(main, hue_shift=lambda h: h + 22), 'dragon-purple-1')
for i, (x0, x1) in enumerate([(1180, 1265), (1281, 1367), (1439, 1503)], start=2):
    t = crop(B, x0, 416, x1, 493)
    finish(t, f'dragon-blue-{i}', scale=3.0)
hero = crop(B, 30, 136, 288, 396)
finish(hero, 'dragon-blue-hero')
finish(card(B, 590, 284, 784, 462), 'dragon-blue-card')

# ---- Catalogue cards ---------------------------------------------------
finish(card(B, 800, 284, 999, 462), 'groot-planter')
finish(card(B, 590, 574, 784, 750), 'phone-stand')
finish(card(B, 800, 574, 999, 750), 'flex-octopus')
finish(card(B, 369, 815, 514, 930, heart=True), 'knight-bust')
finish(card(A, 656, 358, 777, 472, heart=True), 'dragon-red-1')
white = card(B, 800, 870, 999, 988)
finish(white, 'dragon-white-1')

# Tool organiser: the reference print carries an orange label; the brand has
# no orange, so the label is re-tinted to the brand blue.
tb = card(B, 44, 815, 191, 930)
hsv = cv2.cvtColor(tb, cv2.COLOR_BGR2HSV).astype(np.int16)
orange = (hsv[..., 0] >= 5) & (hsv[..., 0] <= 25) & (hsv[..., 1] > 120)
hsv[..., 0] = np.where(orange, 113, hsv[..., 0])
tb = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
finish(tb, 'tool-case')

# ---- Category tiles (label strip cropped off; text is live HTML) -------
tiles = {
    'cat-figurines': (343, 116), 'cat-gaming': (482, 116),
    'cat-decor': (343, 228), 'cat-tools': (482, 228),
    'cat-stands': (343, 340), 'cat-animals': (482, 340),
    'cat-parts': (343, 452), 'cat-stl': (482, 452),
}
for name, (x, y) in tiles.items():
    # Full tile, with the baked-in label band inpainted (the label is live text).
    t = crop(A, x + 3, y + 3, x + 130, y + 102)
    t = inpaint(t, rects=[(6, 74, 121, 97)])
    finish(t, name, scale=2.5)

print('ok', sorted(os.listdir(OUT)))
