"""Renders screwdown_preview.png: python3 render_screwdown.py"""
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import trimesh, render_preview as rp
from make_box import make_base, make_ear_pad, make_ear_washer, EAR_HOLES, FOOT_H, SCREW_D, Manifold, cyl
base, pad, wsh = make_base(), make_ear_pad(), make_ear_washer()
x, y = EAR_HOLES[1]                                   # +Y side ear
win = Manifold.cube([70, 50, 40]).translate([x-35, y-30, -1])
screw = cyl(SCREW_D/2, -FOOT_H-15, 9+0.1, x, y) + cyl(4, 9, 11.5, x, y)
table = Manifold.cube([80, 60, 4]).translate([x-40, y-35, -FOOT_H-4])
def ex(dz): return [rp.tm(table.translate([0, 0, -2*dz])), rp.tm(pad.translate([x, y, -FOOT_H-dz])), rp.tm(base ^ win),
                    rp.tm(make_ear_washer().translate([x, y, 6+dz])), rp.tm(screw.translate([0, 0, 2.2*dz]))]
cut = Manifold.cube([80, 80, 80]).translate([x, y-40, -40])  # removes x > hole centre
fig, axs = plt.subplots(1, 3, figsize=(19, 7)); fig.patch.set_facecolor('white')
rp.draw(axs[0], ex(12), rp.view(60, 25), '1. pad under the ear, washer on top, screw')
rp.draw(axs[1], ex(0), rp.view(60, 25), '2. screwed down: ear clamped between TPU')
rp.draw(axs[2], [rp.tm(m - cut) for m in [table, pad.translate([x, y, -FOOT_H]), base ^ win, wsh.translate([x, y, 6]), screw]],
        rp.view(0, 5), '3. section: the screw never touches the ear')
plt.tight_layout(); plt.savefig('screwdown_preview.png', dpi=75, facecolor='white')
