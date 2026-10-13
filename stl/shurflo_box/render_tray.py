"""Renders tray_preview.png: python3 render_tray.py"""
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import render_preview as rp
from make_box import make_base, make_lid, make_tray, MAT_BASE, Manifold
B, LID, T = make_base(), make_lid(), make_tray()
up = lambda m, z: m.translate([0, 0, z])
fig, axs = plt.subplots(2, 2, figsize=(18, 13)); fig.patch.set_facecolor('white')
rp.draw(axs[0, 0], [rp.tm(T)], rp.view(-35, 40), 'TPU tray 219 x 225 mm (rim 6 mm)')
rp.draw(axs[0, 1], [rp.tm(T.rotate([180, 0, 0]))], rp.view(-35, 40), 'Underside: grip grooves')
rp.draw(axs[1, 0], [rp.tm(T), rp.tm(up(B, MAT_BASE+70)), rp.tm(up(LID, MAT_BASE+70))], rp.view(-35, 25), 'The box drops in...')
cut = Manifold.cube([300, 300, 300]).translate([-150, 0, -50])
rp.draw(axs[1, 1], [rp.tm(T - cut), rp.tm(up(B, MAT_BASE) - cut)], rp.view(-90, 15), '...and sits in the pocket, ears included')
plt.tight_layout(); plt.savefig('tray_preview.png', dpi=75, facecolor='white')
