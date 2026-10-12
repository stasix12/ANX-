"""Renders preview.png (no OpenGL needed): python3 render_preview.py"""
import trimesh, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from make_box import make_base, make_lid
def tm(m):
    x = m.to_mesh(); return trimesh.Trimesh(np.asarray(x.vert_properties)[:, :3], np.asarray(x.tri_verts), process=False)
base, lid = tm(make_base()), tm(make_lid())
# rough Shurflo 8095 proxy (measured off the product photo): bracket 76x96, motor d76, head d87, side ports
C = trimesh.creation
def at(m, x, y, z): m = m.copy(); m.apply_translation([x, y, z]); return m
ax_x = trimesh.transformations.rotation_matrix(np.pi/2, [0, 1, 0])
def xcyl(r, l, x0): c = C.cylinder(r, l, sections=48); c.apply_transform(ax_x); return at(c, x0+l/2, 0, 4+3+44)
pump = trimesh.util.concatenate([at(C.box([76, 96, 3]), -15, 0, 4+1.5), xcyl(38, 125, -80), xcyl(43.5, 50, 45),
                                 xcyl(15, 15, -95), at(C.box([16, 110, 16]), 70, 0, 4+3+70)])
def view(az, el):                 # rows: screen-right, screen-up, towards viewer
    d = np.array([np.cos(np.radians(el))*np.cos(np.radians(az)), np.cos(np.radians(el))*np.sin(np.radians(az)), np.sin(np.radians(el))])
    r = np.cross([0, 0, 1], d) if abs(d[2]) < 0.999 else np.array([1., 0, 0]); r /= np.linalg.norm(r)
    return np.array([r, np.cross(d, r), d])
def draw(ax, parts, V, title):
    light = V.T @ np.array([-0.35, 0.55, 0.75]); light /= np.linalg.norm(light)
    P, C, Dp = [], [], []
    for m in parts:
        n = m.face_normals; k = n @ V[2] > 1e-6
        t = m.triangles[k] @ V.T
        sh = 0.18 + 0.62*np.clip(n[k] @ light, 0, 1) + 0.12*np.clip(n[k] @ V[2], 0, 1)
        P.append(t[:, :, :2]); Dp.append(t[:, :, 2].mean(1)); C.append(np.repeat(sh[:, None], 3, 1)*[0.9, 0.92, 1.0])
    P = np.vstack(P); C = np.clip(np.vstack(C), 0, 1); o = np.argsort(np.concatenate(Dp))
    ax.add_collection(PolyCollection(P[o], facecolors=C[o], edgecolors=C[o], linewidths=0.2))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title, fontsize=14)
up = lid.copy(); up.apply_translation([0, 0, 60])
fig, axs = plt.subplots(2, 3, figsize=(21, 13)); fig.patch.set_facecolor('white')
draw(axs[0, 0], [base, lid], view(-35, 28), 'Assembled  210 x 140 x 120 mm')
draw(axs[0, 1], [base, up], view(-35, 28), 'Base + lid, 6 x M4 screws')
draw(axs[0, 2], [base, pump], view(150, 50), 'Shurflo 8095 (approx.) inside the base')
draw(axs[1, 0], [base, lid], view(0, 0), 'Front: power | outlet | inlet')
draw(axs[1, 1], [base, lid], view(-90, 89.9), 'Top')
draw(axs[1, 2], [base, lid], view(-90, 0), 'Side')
plt.tight_layout(); plt.savefig('preview.png', dpi=80, facecolor='white')
