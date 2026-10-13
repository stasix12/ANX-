"""Renders damper_preview.png: python3 render_damper.py"""
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import render_preview as rp
from make_box import make_base, make_ear_mount, make_foot, EAR_HOLES, PILLARS, FOOT_H, Manifold
ear, foot, base = make_ear_mount(), make_foot(), make_base()
x, y = EAR_HOLES[0]                                  # (-78, -95)
win = Manifold.cube([70, 50, 40]).translate([x-35, y-25, -FOOT_H-1])   # window around one ear
fig, axs = plt.subplots(2, 3, figsize=(18, 11)); fig.patch.set_facecolor('white')
rp.draw(axs[0, 0], [rp.tm(ear)], rp.view(-60, 30), 'Ear damper (TPU) - 30 mm pad, 8 mm high')
rp.draw(axs[0, 1], [rp.tm(ear.rotate([180, 0, 0]))], rp.view(-60, 35), 'Underside: grip rings')
rp.draw(axs[0, 2], [rp.tm(ear - Manifold.cube([40, 40, 40]).translate([0, -20, -5]))], rp.view(-90, 5), 'Half section: snap pin + lip')
rp.draw(axs[1, 0], [rp.tm(base ^ win), rp.tm(ear.translate([x, y, -FOOT_H - 18]))], rp.view(-60, 20), 'Push up into the mounting ear...')
rp.draw(axs[1, 1], [rp.tm(base ^ win), rp.tm(ear.translate([x, y, -FOOT_H]))], rp.view(-60, 20), '...the lip clicks over the ear')
rp.draw(axs[1, 2], [rp.tm(base)] + [rp.tm(ear.translate([px, py, -FOOT_H])) for px, py in EAR_HOLES]
        + [rp.tm(foot.translate([px, py, -FOOT_H])) for px, py in PILLARS[:4]], rp.view(-35, -25), '4 ear dampers + 4 corner feet (from below)')
plt.tight_layout(); plt.savefig('damper_preview.png', dpi=75, facecolor='white')
