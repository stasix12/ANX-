import trimesh, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
R = trimesh.transformations.rotation_matrix
tube = trimesh.load('tube_D40_L250_threaded_spigot38.stl'); nip = trimesh.load('threaded_connector_M32.stl')
tube = trimesh.Trimesh(*trimesh.remesh.subdivide_to_size(tube.vertices, tube.faces, 10))
def tubes_and_nipple(gap):
    a = tube.copy(); a.apply_transform(R(np.pi/2, [0, 1, 0])); a.apply_translation([-250-gap, 0, 0])   # threaded end at x=-gap
    b = tube.copy(); b.apply_transform(R(-np.pi/2, [0, 1, 0])); b.apply_translation([250+gap, 0, 0])
    n = nip.copy(); n.apply_transform(R(np.pi/2, [0, 1, 0])); n.apply_translation([-30, 0, 0])
    return a, b, n
def cut(m):  # keep half (y<0) for section view
    b = trimesh.creation.box(extents=[1000, 100, 100]); b.apply_translation([0, 50, 0])
    return trimesh.boolean.difference([m, b])
GREY, ORANGE = '#9aa5b1', '#e07a2f'
def draw(ax, parts, elev, azim, title):
    V = (R(np.radians(elev), [1, 0, 0]) @ R(np.radians(azim), [0, 0, 1]))[:3, :3]
    light = np.array([0.3, 0.5, 0.8]); light /= np.linalg.norm(light)
    P = []; C = []; D = []
    for m, col in parts:
        t = m.triangles @ V.T; n = m.face_normals @ V.T; k = n[:, 2] > 0
        sh = 0.3 + 0.7*np.clip(n[k] @ light, 0, 1)
        P.append(t[k][:, :, :2]); D.append(t[k][:, :, 2].mean(1))
        C.append(np.clip(np.array(matplotlib.colors.to_rgb(col))*sh[:, None], 0, 1))
    P = np.vstack(P); C = np.vstack(C); o = np.argsort(np.concatenate(D))
    ax.add_collection(PolyCollection(P[o], facecolors=C[o], edgecolors=C[o], linewidths=0.2))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title, fontsize=13)
fig = plt.figure(figsize=(16, 15)); gs = fig.add_gridspec(4, 2, height_ratios=[1, 1, 1.1, 1.4])
a, b, n = tubes_and_nipple(0)
draw(fig.add_subplot(gs[0, :]), [(a, GREY), (b, GREY)], -65, -15, 'Assembled 500 mm:  [38 mm end -> suction head]  ...  OD 40 tubes, screwed together  ...  [38 mm end -> steel pipe]')
a, b, n = tubes_and_nipple(90)
draw(fig.add_subplot(gs[1, :]), [(a, GREY), (n, ORANGE), (b, GREY)], -65, -15, 'Exploded: threaded connector screws 30 mm into each tube - no bolts')
a, b, n = tubes_and_nipple(0)
sec = [(cut(m), c) for m, c in ((a, GREY), (b, GREY), (n, ORANGE))]
ax = fig.add_subplot(gs[2, :]); draw(ax, sec, 90, 0, 'Cross-section at the joint (wall 7 mm, thread M32 x 3)')
ax.set_xlim(-90, 90)
draw(fig.add_subplot(gs[3, 0]), [(nip, ORANGE)], -70, -30, 'Connector: thread OD 32, pitch 3, length 60, bore 22')
t = trimesh.load('tube_D40_L250_threaded_spigot38.stl'); b = trimesh.creation.box(extents=[100, 100, 200]); b.apply_translation([0, 0, 170]); t = trimesh.boolean.difference([t, b])
draw(fig.add_subplot(gs[3, 1]), [(t.apply_transform(R(np.pi, [1, 0, 0])), GREY)], -35, -30, 'Free end: 38 mm push-in spigot (37.4 -> 37.9 taper, 40 long), ID 26')
plt.tight_layout(); plt.savefig('preview.png', dpi=110)
