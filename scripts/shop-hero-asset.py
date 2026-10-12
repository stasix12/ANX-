"""
Builds the /shop home hero background (black ANACONDA on a grey sofa, dark
blue cinematic light) from the approved hero reference.

Only the photograph is kept: the reference also carries the status bar,
header icons, wordmark, headline, sub-copy, CTA, benefit row and pager dots,
which the site renders as real HTML. Those pixels are masked (text-coloured
pixels inside each UI box, whole boxes for the CTA/icons) and inpainted, and
the frame is cropped above the white sheet. The handle itself is untouched.

  python3 scripts/shop-hero-asset.py <hero-reference.png>
"""
import os, sys
import cv2
import numpy as np

src = cv2.imread(sys.argv[1])
img = src[0:842].copy()                      # stop above the white sheet
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
white = (V > 150) & (S < 70)
bluetxt = (H > 105) & (H < 150) & (S > 110) & (V > 110)
textlike = (white | bluetxt).astype(np.uint8) * 255

mask = np.zeros(img.shape[:2], np.uint8)
def text_box(x0, y0, x1, y1, grow=4):
    m = np.zeros_like(mask)
    m[y0:y1, x0:x1] = textlike[y0:y1, x0:x1]
    m = cv2.dilate(m, np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8))
    np.maximum(mask, m, out=mask)
def solid_box(x0, y0, x1, y1):
    mask[y0:y1, x0:x1] = 255

# status bar + header
text_box(55, 15, 145, 60); text_box(645, 15, 815, 60)
text_box(25, 80, 90, 125); text_box(310, 65, 545, 130)
text_box(670, 75, 725, 130); solid_box(760, 66, 830, 130)
# hero copy
text_box(35, 340, 235, 390, 5)               # — ANX3D
text_box(35, 390, 365, 452, 5)               # title line 1
text_box(35, 448, 520, 506, 5)               # title line 2 (blue)
text_box(35, 508, 505, 582, 4)               # sub-copy
solid_box(8, 566, 400, 704)                  # CTA and its whole glow
# benefit row + pager dots
for cx in (170, 425, 680):
    solid_box(cx - 40, 690, cx + 40, 768)
    text_box(cx - 140, 762, cx + 140, 822, 4)
solid_box(395, 820, 455, 846)

out = cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)
# Soften the inpainted CTA / icon patches into the sofa texture.
blur = cv2.GaussianBlur(out, (0, 0), 3)
soft = cv2.GaussianBlur(mask, (0, 0), 4).astype(np.float32)[..., None] / 255
out = (out * (1 - soft * 0.6) + blur * soft * 0.6).astype(np.uint8)

# The CTA's violet glow bleeds past its box; neutralise it so the photo
# reads clean wherever the button is not drawn on top (desktop layout).
zone = out[540:760, 0:470]
zh = cv2.cvtColor(zone, cv2.COLOR_BGR2HSV).astype(np.float32)
violet = ((zh[..., 0] > 118) & (zh[..., 0] < 160) & (zh[..., 1] > 50)).astype(np.float32)
violet = cv2.GaussianBlur(violet, (0, 0), 6)
zh[..., 1] *= 1 - 0.8 * violet
zh[..., 2] *= 1 - 0.35 * violet
out[540:760, 0:470] = cv2.cvtColor(np.clip(zh, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

dst = os.path.join(os.path.dirname(__file__), '..', 'public', 'shop', 'img2', 'hero-anaconda.webp')
big = cv2.resize(out, (1275, 1263), interpolation=cv2.INTER_LANCZOS4)  # 1.5x for retina phones
cv2.imwrite(dst, big, [cv2.IMWRITE_WEBP_QUALITY, 88])
cv2.imwrite('/tmp/claude-0/h/mask.png', mask)
print('ok', big.shape)
