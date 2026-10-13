"""Renders gland_preview.png: python3 render_gland.py"""
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import render_preview as rp
from make_gland import make_body, make_cap, make_locknut, make_seal, WALL_T, FLANGE_T, CAP_T, FING_L, SEAL_L
body, cap, nut, seal = make_body(), make_cap(), make_locknut(), make_seal()
z_t2 = WALL_T + FLANGE_T
cut = rp.tm  # mesh conversion
half = lambda m: m - __import__('make_box').Manifold.cube([40, 80, 200]).translate([0, -40, -50])
fig, axs = plt.subplots(1, 3, figsize=(18, 7))
V = rp.view(-60, 20)
rp.draw(axs[0], [cut(body), cut(cap.translate([0, 0, z_t2+45])), cut(nut.translate([0, 0, -14])), cut(seal.translate([0, 0, z_t2+CAP_T+FING_L+6]))], V, 'Exploded: lock nut | body | seal (TPU) | cap')
rp.draw(axs[1], [cut(body), cut(cap.rotate([0, 0, 0]).translate([0, 0, z_t2])), cut(nut.translate([0, 0, 3.2]))], V, 'Assembled (box wall between flange and nut)')
rp.draw(axs[2], [cut(half(body)), cut(half(cap.translate([0, 0, z_t2]))), cut(half(nut.translate([0, 0, 3.2]))),
                 cut(half(seal.translate([0, 0, z_t2+CAP_T+FING_L-SEAL_L])))], rp.view(0, 10), 'Section: cone squeezes fingers + seal onto the cable')
plt.tight_layout(); plt.savefig('gland_preview.png', dpi=75, facecolor='white')
