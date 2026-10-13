"""Renders handle_preview.png: python3 render_handle.py"""
import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import render_preview as rp
from make_box import make_base, make_lid, H, Manifold
from make_handle import make_handle, T
hd = make_handle()
ON_BOX = np.array([[0, 0, 1, -T/2], [1, 0, 0, 0], [0, 1, 0, H]], float)   # profile u->Y, v->Z, thickness->X
B, LID = make_base(), make_lid()
mounted = hd.transform(ON_BOX)
print('handle vs lid interference:', round((mounted ^ LID).volume(), 2), ' vs base:', round((mounted ^ B).volume(), 2))
fig, axs = plt.subplots(2, 2, figsize=(18, 14)); fig.patch.set_facecolor('white')
rp.draw(axs[0, 0], [rp.tm(B), rp.tm(LID), rp.tm(mounted)], rp.view(-35, 25), 'Carry handle on the two middle lid screws')
rp.draw(axs[0, 1], [rp.tm(B), rp.tm(LID), rp.tm(mounted)], rp.view(0, 0), 'Front: 40 mm finger space above the lid')
rp.draw(axs[1, 0], [rp.tm(hd)], rp.view(-90, 60), 'Print lying on its side (no supports)')
cut = Manifold.cube([300, 300, 300]).translate([0, -150, -50])
rp.draw(axs[1, 1], [rp.tm(m - cut) for m in (B, LID, mounted)], rp.view(0, 10), 'Section: spigot in the counterbore, M4x60 into the base pillar')
plt.tight_layout(); plt.savefig('handle_preview.png', dpi=75, facecolor='white')
