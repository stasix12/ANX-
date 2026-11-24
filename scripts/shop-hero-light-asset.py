"""
Builds the light /shop home hero background (black ANACONDA in front of a
waving Israeli flag, white/light-blue studio) from the approved reference
screenshot. Only the photograph is kept: the slogan, headline, sub-copy, CTA,
benefit row and pager dots are rendered by the site as live HTML, so those
pixels are found (difference from a local median) inside each UI box and
inpainted. The handle and the flag are otherwise untouched.

  python3 scripts/shop-hero-light-asset.py <reference.png> <out.webp>
"""
import sys
import cv2
import numpy as np

src = cv2.imread(sys.argv[1])
img = src[118:948, 0:852].copy()          # hero only: below the header, page width
med = cv2.medianBlur(img, 31)
diff = cv2.absdiff(img, med).max(axis=2)

mask = np.zeros(img.shape[:2], np.uint8)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
def text_box(x0, y0, x1, y1, thr=28, grow=5):
    m = np.zeros_like(mask)
    m[y0:y1, x0:x1] = (diff[y0:y1, x0:x1] > thr).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8))
    np.maximum(mask, m, out=mask)
def solid_box(x0, y0, x1, y1):
    mask[y0:y1, x0:x1] = 255

o = 118  # reference y offset
text_box(40, 432 - o, 285, 478 - o)              # — ANX3D |
# The slogan lies over the handle: take only its white letters (the handle is
# dark and textured, so a difference mask would wipe the trigger and brass).
y0, y1, x0, x1 = 438 - o, 474 - o, 285, 700
letters = ((hsv[..., 2] > 185) & (hsv[..., 1] < 60)).astype(np.uint8) * 255
on_handle = np.zeros_like(mask)
on_handle[y0:y1, x0:x1] = letters[y0:y1, x0:x1]
on_handle = cv2.dilate(on_handle, np.ones((5, 5), np.uint8))
# Headline and sub-copy are navy / brand blue: mask by hue so the black
# handle, its trigger and the brass fittings behind them stay intact.
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
def blue_box(x0, y0, x1, y1, grow=3):
    h, sat = hsv[..., 0].astype(int), hsv[..., 1].astype(int)
    m = np.zeros_like(mask)
    sel = ((h >= 100) & (h <= 135) & (sat > 80)).astype(np.uint8) * 255
    m[y0:y1, x0:x1] = sel[y0:y1, x0:x1]
    m = cv2.dilate(m, np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8))
    np.maximum(mask, m, out=mask)
blue_box(40, 478 - o, 560, 595 - o)              # headline
blue_box(40, 605 - o, 545, 690 - o)              # sub-copy
solid_box(38, 694 - o, 395, 776 - o)             # CTA
# the CTA's blue glow below it
glow = np.zeros_like(mask)
b, r = img[..., 0].astype(int), img[..., 2].astype(int)
y0, y1 = 676 - o, 800 - o
glow[y0:y1, 20:420] = ((b - r)[y0:y1, 20:420] > 18).astype(np.uint8) * 255
np.maximum(mask, cv2.dilate(glow, np.ones((9, 9), np.uint8)), out=mask)
text_box(80, 780 - o, 790, 925 - o, thr=22)      # benefit icons + labels
solid_box(395, 925 - o, 455, 948 - o)            # pager dots

out = cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)
out = cv2.inpaint(out, on_handle, 4, cv2.INPAINT_NS)
# Smooth the inpainted areas so no ghost strokes remain on the light backdrop.
soft = cv2.GaussianBlur(out, (0, 0), 6)
m = cv2.GaussianBlur(mask, (0, 0), 3).astype(np.float32)[..., None] / 255
out = (soft * m + out * (1 - m)).astype(np.uint8)
cv2.imwrite(sys.argv[2], out, [cv2.IMWRITE_WEBP_QUALITY, 90])
