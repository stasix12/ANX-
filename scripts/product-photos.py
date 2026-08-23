"""
Prepares the photos in photos/source/ for the catalogue.

    pip install numpy opencv-python-headless
    python3 scripts/product-photos.py

The photos go up exactly as they were taken: the full frame, the original
background, nothing retouched, nothing cropped.

The one thing that does happen is a resize to web size in WebP. That is the
same picture — a phone frame is several thousand pixels wide and weighs more
than the whole rest of the page, which on a phone means the shop is slow to
load before anybody sees the product at all.
"""

import os
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'photos', 'source')
DEST = os.path.join(ROOT, 'public', 'products', 'anx-anaconda')

LONGEST_SIDE = 1600

# Gallery order: the jungle-green handle first, then the same handle in black.
# The first entry is also what the catalogue card shows.
ORDER = [
    'anaconda-4.jpg', 'anaconda-1.jpg', 'anaconda-2.jpg', 'anaconda-3.jpg',
    'anaconda-black-1.jpg', 'anaconda-black-2.jpg',
    'anaconda-black-3.jpg', 'anaconda-black-4.jpg',
]


def web_size(img):
    """Same frame, fewer pixels."""
    height, width = img.shape[:2]
    scale = LONGEST_SIDE / max(height, width)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(width * scale), round(height * scale)),
                      interpolation=cv2.INTER_AREA)


def main():
    os.makedirs(DEST, exist_ok=True)

    for index, filename in enumerate(ORDER, 1):
        img = cv2.imread(os.path.join(SOURCE, filename))
        if img is None:
            raise SystemExit(f'missing source photo: {filename}')

        out = web_size(img)
        target = os.path.join(DEST, f'{index}.webp')
        cv2.imwrite(target, out, [cv2.IMWRITE_WEBP_QUALITY, 88])
        print(f'{os.path.relpath(target, ROOT)}  {out.shape[1]}x{out.shape[0]}  '
              f'{os.path.getsize(target) // 1024} KB')


if __name__ == '__main__':
    main()
