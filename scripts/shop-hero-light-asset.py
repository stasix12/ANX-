"""
Builds the light /shop home hero photo (black ANACONDA before a waving
Israeli flag, white/light-blue studio) from the approved reference
screenshot. Only the photograph above the copy is kept; the slogan row that
touches its bottom edge is inpainted. All copy is rendered as live HTML.

  python3 scripts/shop-hero-light-asset.py <reference.png> <out.webp>
"""
import sys
import cv2
import numpy as np

src = cv2.imread(sys.argv[1])
W = src.shape[1]
top, bottom = 181, 1045                 # below the header, through the slogan row
img = src[top:bottom, 0:W - 2].copy()   # drop the 2px screenshot edge

# slogan row: dark / blue glyphs and the divider, left of the handle base
y0, y1, x0, x1 = 975 - top, bottom - top, 80, 945
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
dark = (hsv[..., 2] < 150) | ((hsv[..., 1] > 90) & (hsv[..., 0] > 95) & (hsv[..., 0] < 135))
mask = np.zeros(img.shape[:2], np.uint8)
mask[y0:y1, x0:x1] = dark[y0:y1, x0:x1].astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
out = cv2.inpaint(img, mask, 11, cv2.INPAINT_TELEA)
soft = cv2.GaussianBlur(out, (0, 0), 8)
m = cv2.GaussianBlur(mask, (0, 0), 4).astype(np.float32)[..., None] / 255
out = (soft * m + out * (1 - m)).astype(np.uint8)
cv2.imwrite(sys.argv[2], out, [cv2.IMWRITE_WEBP_QUALITY, 90])
