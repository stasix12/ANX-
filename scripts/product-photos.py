"""
Prepares the photos in photos/source/ for the catalogue.

    pip install numpy opencv-python-headless
    python3 scripts/product-photos.py

The photos are used as shot. The only changes are ones the browser would make
anyway: a square crop, because every product frame on the site is square and
would otherwise crop the picture itself at an arbitrary place, and a resize to
web size in WebP, because a 2400px phone JPEG is several times the weight of
the whole page.

The crop is centred on the tool rather than on the frame, so it is not cut off
in shots where it sits to one side. That is found from the shell's colour: it
is a single extremely saturated yellow-green that nothing else in the room
comes near.
"""

import os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'photos', 'source')
DEST = os.path.join(ROOT, 'public', 'products', 'anx-anaconda')

SIZE = 1400
ORDER = ['anaconda-4.jpg', 'anaconda-1.jpg', 'anaconda-2.jpg', 'anaconda-3.jpg']


def subject_centre(img):
    """Middle of the yellow-green shell, or of the frame if it is not found."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    m = ((h > 25) & (h < 50) & (s > 110) & (v > 90)).astype(np.uint8)

    ys, xs = np.nonzero(m)
    if len(ys) < 0.01 * img.size / 3:
        return img.shape[1] // 2, img.shape[0] // 2
    return (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2


def square(img):
    height, width = img.shape[:2]
    side = min(height, width)
    cx, cy = subject_centre(img)
    x = int(np.clip(cx - side // 2, 0, width - side))
    y = int(np.clip(cy - side // 2, 0, height - side))
    return cv2.resize(img[y:y + side, x:x + side], (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def main():
    os.makedirs(DEST, exist_ok=True)

    for index, filename in enumerate(ORDER, 1):
        img = cv2.imread(os.path.join(SOURCE, filename))
        if img is None:
            raise SystemExit(f'missing source photo: {filename}')

        target = os.path.join(DEST, f'{index}.webp')
        cv2.imwrite(target, square(img), [cv2.IMWRITE_WEBP_QUALITY, 88])
        print(f'{os.path.relpath(target, ROOT)}  {os.path.getsize(target) // 1024} KB')


if __name__ == '__main__':
    main()
