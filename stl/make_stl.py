"""1 m wand: four hollow tubes (OD 40, L 250, thick wall) joined by three screw-in threaded nipples.
Tube A: 38 mm spigot -> suction head | Tubes B, C: middle | Tube D: spigot -> steel pipe (ID ~36-37 mm)."""
import numpy as np, trimesh
from trimesh.creation import cylinder

OD, ID, L = 40.0, 26.0, 250.0            # tube: wall 7 mm
P, R_MAJ, DEPTH = 4.0, 17.0, 1.6          # thread: M34x4, ~45deg flanks (prints without supports)
NIP_L, NIP_BORE = 80.0, 22.0              # nipple: 40 mm into each tube (wide bore for airflow)
# tapered push-in ends: (length, tip dia, root dia)
SPIGOT_SUCTION = (40.0, 37.6, 38.3)       # suction head inlet 38 mm: press fit, wedges ~23 mm in
SPIGOT_STEEL = (50.0, 35.4, 37.0)         # steel pipe ID ~36-37 mm: wedges wherever it meets the bore
THREAD_DEPTH_IN_TUBE = 42.0
CLEAR = 0.25                              # radial clearance for printing
NT, DZ = 160, 0.15

def profile(u):                           # 0..1 radial height along one pitch
    u = u % 1.0
    return np.interp(u, [0, .10, .45, .55, .90, 1], [0, 0, 1, 1, 0, 0])

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
nipple.export('connector_M34_x3.stl')

def female_thread(at_top):
    c = threaded_solid(R_MAJ+CLEAR, THREAD_DEPTH_IN_TUBE+1, chamfer=False)
    e = trimesh.creation.cone(radius=R_MAJ+CLEAR+1.3, height=R_MAJ+CLEAR+1.3, sections=NT+7)
    e.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
    e.apply_translation([0, 0, THREAD_DEPTH_IN_TUBE+0.3])   # entrance chamfer
    parts = [c, e]
    if at_top:
        for p in parts: p.apply_translation([0, 0, L-THREAD_DEPTH_IN_TUBE])
    else:                                                       # mirror to the bottom end
        for p in parts:
            p.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
            p.apply_translation([0, 0, THREAD_DEPTH_IN_TUBE])
    return parts

# --- tube: z=0 end is a tapered spigot or a female thread; z=L end is always a female thread ---
def build_tube(spigot, filename):
    if spigot:
        sl, tip, root = spigot
        outline = [[0, 0], [tip/2 - 0.8, 0], [tip/2, 0.8], [root/2, sl], [OD/2, sl], [OD/2, L], [0, L]]
    else:
        outline = [[0, 0], [OD/2 - 0.6, 0], [OD/2, 0.6], [OD/2, L], [0, L]]
    tube = trimesh.creation.revolve(outline, sections=NT)
    bore = cylinder(radius=ID/2, height=L+2, sections=NT); bore.apply_translation([0, 0, L/2])
    cuts = [bore] + female_thread(at_top=True) + ([] if spigot else female_thread(at_top=False))
    trimesh.boolean.difference([tube] + cuts).export(filename)

TUBES = {'tube_A_suction_head_38.stl': SPIGOT_SUCTION,
         'tube_B_C_middle_x2.stl': None,
         'tube_D_steel_pipe_36-37.stl': SPIGOT_STEEL}
for name, spigot in TUBES.items():
    build_tube(spigot, name)

for n in (*TUBES, 'connector_M34_x3.stl'):
    m = trimesh.load(n); print(n, 'watertight:', m.is_watertight, 'size:', np.round(m.extents, 1))
