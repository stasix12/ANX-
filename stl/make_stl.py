"""Two hollow tubes (OD 40, L 250, thick wall) joined by a screw-in threaded nipple (no bolts)."""
import numpy as np, trimesh
from trimesh.creation import cylinder

OD, ID, L = 40.0, 26.0, 250.0            # tube: wall 7 mm
P, R_MAJ, DEPTH = 3.0, 16.0, 1.5          # thread: M32x3 trapezoid-ish
NIP_L, NIP_BORE = 60.0, 18.0              # nipple: 30 mm into each tube
THREAD_DEPTH_IN_TUBE = 32.0
CLEAR = 0.25                              # radial clearance for printing
NT, DZ = 160, 0.15

def profile(u):                           # 0..1 radial height along one pitch
    u = u % 1.0
    return np.interp(u, [0, .15, .40, .60, .85, 1], [0, 0, 1, 1, 0, 0])

def threaded_solid(r_maj, length, bore_r=None, chamfer=True):
    """Watertight helical-threaded cylinder along Z from 0..length (optionally hollow)."""
    th = np.linspace(0, 2*np.pi, NT, endpoint=False)
    zs = np.linspace(0, length, int(length/DZ)+1)
    T, Z = np.meshgrid(th, zs)
    r = r_maj - DEPTH + DEPTH*profile(Z/P - T/(2*np.pi))
    if chamfer:                            # 45deg lead-in at both ends
        d = np.minimum(Z, length-Z)
        r = np.minimum(r, r_maj - DEPTH - 0.3 + d)
    outer = np.stack([r*np.cos(T), r*np.sin(T), Z], -1).reshape(-1, 3)
    nz = len(zs); idx = lambda i, j: i*NT + j % NT
    F = []
    for i in range(nz-1):
        for j in range(NT):
            a, b, c, d = idx(i, j), idx(i, j+1), idx(i+1, j+1), idx(i+1, j)
            F += [[a, b, c], [a, c, d]]
    V = [outer]; base = len(outer)
    if bore_r:                             # inner bore rings at z=0 and z=length
        ring = np.stack([bore_r*np.cos(th), bore_r*np.sin(th)], -1)
        V += [np.c_[ring, np.zeros(NT)], np.c_[ring, np.full(NT, length)]]
        b0, b1 = base, base+NT
        for j in range(NT):
            k = (j+1) % NT
            F += [[b0+j, b1+k, b1+j], [b0+j, b0+k, b1+k]]                    # bore wall
            F += [[idx(0, j), b0+k, idx(0, k)], [idx(0, j), b0+j, b0+k]]       # bottom cap
            t0, t1 = idx(nz-1, j), idx(nz-1, k)
            F += [[t0, t1, b1+k], [t0, b1+k, b1+j]]                            # top cap
    else:
        V += [np.array([[0, 0, 0], [0, 0, length]])]
        c0, c1 = base, base+1
        for j in range(NT):
            F += [[c0, idx(0, j+1), idx(0, j)], [c1, idx(nz-1, j), idx(nz-1, j+1)]]
    m = trimesh.Trimesh(np.vstack(V), np.array(F), process=True)
    m.fix_normals()
    return m

# --- threaded nipple (connector) ---
nipple = threaded_solid(R_MAJ, NIP_L, bore_r=NIP_BORE/2)
nipple.export('threaded_connector_M32.stl')

# --- tube with internal thread at one end ---
tube = cylinder(radius=OD/2, height=L, sections=NT); tube.apply_translation([0, 0, L/2])
bore = cylinder(radius=ID/2, height=L+2, sections=NT); bore.apply_translation([0, 0, L/2])
cutter = threaded_solid(R_MAJ+CLEAR, THREAD_DEPTH_IN_TUBE+1, chamfer=False)
cutter.apply_translation([0, 0, L-THREAD_DEPTH_IN_TUBE])
entry = trimesh.creation.cone(radius=R_MAJ+CLEAR+1.3, height=R_MAJ+CLEAR+1.3, sections=NT+7)
entry.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
entry.apply_translation([0, 0, L+0.3])   # small chamfer at the thread entrance
tube = trimesh.boolean.difference([tube, bore, cutter, entry])
tube.export('tube_D40_L250_threaded.stl')

for n in ('tube_D40_L250_threaded.stl', 'threaded_connector_M32.stl'):
    m = trimesh.load(n); print(n, 'watertight:', m.is_watertight, 'size:', np.round(m.extents, 1))
