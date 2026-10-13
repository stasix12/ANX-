"""Renders mounted_preview.png: the box screwed to a board on the TPU ear pads. python3 render_mounted.py"""
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import trimesh, render_preview as rp
from make_box import (make_lid, make_ear_pad, make_ear_washer, EAR_HOLES, PILLARS, FOOT_H, SCREW_D,
                      Manifold, cyl, make_foot)
from make_box import make_base
B, LID = make_base(), make_lid()
parts = [B, LID]
for x, y in EAR_HOLES:
    pad = make_ear_pad() if y > 0 else make_ear_pad().rotate([0, 0, 180])
    parts += [pad.translate([x, y, -FOOT_H]), make_ear_washer().translate([x, y, 6]),
              cyl(SCREW_D/2, -FOOT_H-12, 9.1, x, y) + cyl(4.5, 9, 9.8, x, y) + cyl(3.8, 9.8, 12, x, y)]
board = Manifold.cube([300, 260, 12]).translate([-150, -130, -FOOT_H-12])
M = [rp.tm(p) for p in parts]
pump = rp.pump
fig, axs = plt.subplots(2, 2, figsize=(18, 14)); fig.patch.set_facecolor('white')
rp.draw(axs[0, 0], M + [rp.tm(board)], rp.view(-35, 25), 'Screwed to a board: 4 TPU pads + TPU washers + screws')
rp.draw(axs[0, 1], [rp.tm(B), rp.tm(board)] + M[2:] + [pump], rp.view(150, 45), 'Lid off: pump bolted on its grommets')
rp.draw(axs[1, 0], M + [rp.tm(board)], rp.view(-90, 0), 'Side: the box floats 8 mm above the board on TPU')
rp.draw(axs[1, 1], [rp.tm(p ^ Manifold.cube([60, 50, 60]).translate([-78-30, 70, -FOOT_H-13])) for p in parts + [board]],
        rp.view(60, 25), 'Close-up of one ear')
plt.tight_layout(); plt.savefig('mounted_preview.png', dpi=75, facecolor='white')
