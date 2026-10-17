"""Renders preview.png: dimensioned front view + 3D back view.  python3 render_preview.py"""
import numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch
from make_panel import make_panel, to_trimesh, PW, PH, T, SWITCHES, SWITCH_W, SWITCH_H, ROUND, CABLE, SCREWS, SCREW

fig, (a, b) = plt.subplots(1, 2, figsize=(20, 8)); fig.patch.set_facecolor('white')
a.add_patch(FancyBboxPatch((-PW/2+8, -PH/2+8), PW-16, PH-16, boxstyle='round,pad=8', fc='#d9dde6', ec='k'))
for x, y in SWITCHES:
    a.add_patch(Rectangle((x-SWITCH_W/2-4, y-SWITCH_H/2-4), SWITCH_W+8, SWITCH_H+8, fc='#c3c8d4', ec='0.4', ls='--'))
    a.add_patch(Rectangle((x-SWITCH_W/2, y-SWITCH_H/2), SWITCH_W, SWITCH_H, fc='white', ec='k'))
    a.text(x, y, f'{SWITCH_W}\nx\n{SWITCH_H}', ha='center', va='center', fontsize=8)
for x, y, d in ROUND + [(CABLE[0], CABLE[1], CABLE[2])]:
    a.add_patch(Circle((x, y), d/2, fc='white', ec='k')); a.text(x, y, f'Ø{d:g}', ha='center', va='center', fontsize=11)
for x, y in SCREWS:
    a.add_patch(Circle((x, y), SCREW/2, fc='white', ec='k'))
a.annotate('', (-PW/2, -PH/2-10), (PW/2, -PH/2-10), arrowprops=dict(arrowstyle='<->'))
a.text(0, -PH/2-17, f'{PW:g} mm', ha='center', fontsize=12)
a.annotate('', (-PW/2-10, -PH/2), (-PW/2-10, PH/2), arrowprops=dict(arrowstyle='<->'))
a.text(-PW/2-17, 0, f'{PH:g} mm', va='center', rotation=90, fontsize=12)
a.text(CABLE[0], CABLE[1]+16, 'power cable', ha='center', fontsize=9)
a.set_xlim(-PW/2-30, PW/2+10); a.set_ylim(-PH/2-25, PH/2+10); a.set_aspect('equal'); a.axis('off')
a.set_title(f'Front view  {PW:g} x {PH:g} x {T:g} mm  (dashed = 2 mm switch pockets on the back)', fontsize=13)

m = to_trimesh(make_panel())
el, az = np.radians(40), np.radians(-120)
d = np.array([np.cos(el)*np.cos(az), np.cos(el)*np.sin(az), np.sin(el)]) * [1, 1, -1]   # look at the back face
r = np.cross([0, 0, 1], d); r /= np.linalg.norm(r); V = np.array([r, np.cross(d, r), d])
n = m.face_normals; k = n @ V[2] > 1e-6; t = m.triangles[k] @ V.T
L = V.T @ np.array([-0.3, 0.5, 0.8]); L /= np.linalg.norm(L)
sh = np.clip(0.25 + 0.65*np.clip(n[k] @ L, 0, 1), 0, 1); o = np.argsort(t[:, :, 2].mean(1))
c = np.repeat(sh[:, None], 3, 1) * [0.9, 0.92, 1.0]
b.add_collection(PolyCollection(t[o][:, :, :2], facecolors=c[o], edgecolors=c[o], linewidths=0.2))
b.autoscale(); b.set_aspect('equal'); b.axis('off'); b.set_title('3D view', fontsize=13)
plt.tight_layout(); plt.savefig('preview.png', dpi=80, facecolor='white')
