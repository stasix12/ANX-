import trimesh, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
R = trimesh.transformations.rotation_matrix
FA, FM, FD, FN = 'tube_A_suction_head_38.stl', 'tube_B_C_middle_x2.stl', 'tube_D_steel_pipe_36-37.stl', 'connector_M34_x3.stl'
fine = lambda f: (lambda m: trimesh.Trimesh(*trimesh.remesh.subdivide_to_size(m.vertices, m.faces, 10)))(trimesh.load(f))
A, M, D, N = fine(FA), fine(FM), fine(FD), trimesh.load(FN)
GREY, ORANGE = '#9aa5b1', '#e07a2f'
def along_x(m, x0, flip=False):   # tube z-axis -> +x (or -x when flipped), z=0 end placed at x0
    m = m.copy(); m.apply_transform(R(-np.pi/2 if flip else np.pi/2, [0, 1, 0])); m.apply_translation([x0, 0, 0]); return m
def assembly(gap):
    # A: spigot at x=0 -> thread at x=250 ; B, C: 250..500, 500..750 ; D: thread at 750, spigot at 1000
    parts = [(along_x(A, 0), GREY), (along_x(M, 250+gap), GREY), (along_x(M, 500+2*gap), GREY),
             (along_x(D, 1000+3*gap, flip=True), GREY)]
    for k in (1, 2, 3):
        parts.append((along_x(N, 250*k + (k-0.5)*gap - 40), ORANGE))
    return parts
def cut(m):
    b = trimesh.creation.box(extents=[3000, 100, 100]); b.apply_translation([0, 50, 0])
    return trimesh.boolean.difference([m, b])
def draw(ax, parts, elev, azim, title):
    V = (R(np.radians(elev), [1, 0, 0]) @ R(np.radians(azim), [0, 0, 1]))[:3, :3]
    light = np.array([0.3, 0.5, 0.8]); light /= np.linalg.norm(light)
    P = []; C = []; Dp = []
    for m, col in parts:
        t = m.triangles @ V.T; n = m.face_normals @ V.T; k = n[:, 2] > 0
        sh = 0.3 + 0.7*np.clip(n[k] @ light, 0, 1)
        P.append(t[k][:, :, :2]); Dp.append(t[k][:, :, 2].mean(1))
        C.append(np.clip(np.array(matplotlib.colors.to_rgb(col))*sh[:, None], 0, 1))
    P = np.vstack(P); C = np.vstack(C); o = np.argsort(np.concatenate(Dp))
    ax.add_collection(PolyCollection(P[o], facecolors=C[o], edgecolors=C[o], linewidths=0.2))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title, fontsize=13)
fig = plt.figure(figsize=(18, 15)); gs = fig.add_gridspec(4, 4, height_ratios=[0.8, 0.8, 1.0, 1.4])
draw(fig.add_subplot(gs[0, :]), [p for p in assembly(0) if p[1] == GREY], -70, -8,
     'Assembled 1000 mm:  A (38 -> suction head)  |  B  |  C  |  D (36-37 -> steel pipe)   -  OD 40, 3 hidden screw joints')
draw(fig.add_subplot(gs[1, :]), assembly(90), -70, -8, 'Exploded: 4 tubes x 250 mm + 3 threaded connectors M34 x 4, 80 mm long (40 mm into each tube)')
ax = fig.add_subplot(gs[2, :]); draw(ax, [(cut(m), c) for m, c in assembly(0) if abs(m.bounds.mean(0)[0]-250) < 140], 90, 0,
     'Cross-section of a joint: wall 7 mm, thread M34 x 4 (45 deg flanks), 40 mm engagement per side'); ax.set_xlim(130, 370)
def end(f, top):
    t = trimesh.load(f); b = trimesh.creation.box(extents=[100, 100, 200])
    b.apply_translation([0, 0, 170 if not top else 80]); t = trimesh.boolean.difference([t, b])
    if not top: t.apply_transform(R(np.pi, [1, 0, 0]))
    return t
draw(fig.add_subplot(gs[3, 0]), [(N, ORANGE)], -70, -30, 'Connector x3\nM34 x 4, L 80, bore 22')
draw(fig.add_subplot(gs[3, 1]), [(end(FA, False), GREY)], -35, -30, 'Tube A end -> suction head\n37.6 -> 38.3 press fit')
draw(fig.add_subplot(gs[3, 2]), [(end(FM, True), GREY)], -35, -30, 'Tubes B, C x2\nthread at both ends')
draw(fig.add_subplot(gs[3, 3]), [(end(FD, False), GREY)], -35, -30, 'Tube D end -> steel pipe\n35.4 -> 37.0 taper')
plt.tight_layout(); plt.savefig('preview.png', dpi=100)
