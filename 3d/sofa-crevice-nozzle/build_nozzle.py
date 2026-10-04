"""
ANX3D sofa crevice nozzle - parametric generator (STL, mm).

Axes:  X = length (tip at x=0, hose end at x=L)
       Y = width  (22 mm at the tip)
       Z = height (12 mm at the tip)

Outer and inner surfaces are superellipse lofts (circle -> rounded rectangle),
subtracted with manifold3d so the result is guaranteed watertight / manifold.
"""
import os
import numpy as np
import manifold3d as m3d
from manifold3d import Manifold, Mesh, CrossSection, FillRule
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.environ.get("ANX_FONT", os.path.join(HERE, "ArchivoBlack.ttf"))

# ---------------------------------------------------------------- parameters
L = 250.0                 # overall length
X_COLLAR = 205.0          # collar (round connector) starts here
X_BODY = 125.0            # flat blade ends / transition starts here

R_COLLAR = 23.0           # collar outer radius  (OD 46 -> 5 mm wall on 36 bore)
R_TRANS0 = 21.6           # transition outer radius at collar (1.4 mm 45deg step = visible collar edge, as on the reference)

# hose socket (female, slides over a 36 mm wand/hose end)
BORE_D_MOUTH = 36.0       # at the open end - straight 36 mm bore to match the existing 36 mm handle
BORE_D_BOTTOM = 36.0      # at the stop (same as mouth = straight bore)
BORE_DEPTH = 38.0         # insertion length
STOP_R = 15.0             # stop-shoulder inner radius (3 mm wide hose stop)
LEAD_IN = 1.0             # entry chamfer

# blade, outer
TIP_W, TIP_H = 22.0, 12.0      # outer at the suction opening
BODY_W, BODY_H = 26.0, 20.0    # outer at x = X_BODY (blade tapers toward tip)
N_TIP, N_BODY = 5.0, 4.0       # superellipse exponents (2 = circle)

# walls
WALL_TIP = 3.0
WALL_BODY = 4.0

# tip edge rounding
TIP_R_OUT = 1.0
TIP_R_IN = 0.6

# logo
LOGO = "ANX3D"
LOGO_LEN = 34.0           # overall text length (mm) - ~75% of collar length as on the reference
LOGO_DEPTH = 0.6          # engraved depth
LOGO_X = (X_COLLAR + L) / 2 + 0.5

NSEG = 192                # points per ring


def smooth(s):
    s = np.clip(s, 0.0, 1.0)
    return s * s * s * (s * (6 * s - 15) + 10)   # smootherstep


def lerp(a, b, s):
    return a + (b - a) * s


# ---------------------------------------------------------------- profiles
def outer_profile(x):
    """(half-width a, half-height b, exponent n) of the OUTER surface at x."""
    if x <= X_BODY:
        s = x / X_BODY
        a = lerp(TIP_W / 2, BODY_W / 2, s)
        b = lerp(TIP_H / 2, BODY_H / 2, s ** 0.9)
        n = lerp(N_TIP, N_BODY, s)
        if x < TIP_R_OUT:                      # rounded lip at the opening
            d = TIP_R_OUT - np.sqrt(max(TIP_R_OUT**2 - (TIP_R_OUT - x) ** 2, 0.0))
            a, b = a - d, b - d
        return a, b, n
    if x <= X_COLLAR:
        s = (x - X_BODY) / (X_COLLAR - X_BODY)
        # width lags (flares late, near the collar), height rises earlier:
        # this produces the twisted "swoosh" seen on the reference.
        sa = smooth(s ** 1.55)
        sb = smooth(s ** 0.80)
        a = lerp(BODY_W / 2, R_TRANS0, sa)
        b = lerp(BODY_H / 2, R_TRANS0, sb)
        n = lerp(N_BODY, 2.0, smooth(s ** 0.9))
        return a, b, n
    # collar with 0.8 mm 45deg step at the front and 1 mm chamfer at the rear
    r = R_COLLAR
    if x < X_COLLAR + (R_COLLAR - R_TRANS0):
        r = R_TRANS0 + (x - X_COLLAR)
    if x > L - 1.0:
        r = R_COLLAR - (x - (L - 1.0))
    return r, r, 2.0


X_STOP = L - BORE_DEPTH              # bottom of socket
X_STOP_CH = X_STOP - (BORE_D_BOTTOM / 2 - STOP_R)   # 45deg stop chamfer start
X_INNER_BODY = X_BODY


def wall(x):
    return lerp(WALL_TIP, WALL_BODY, np.clip(x / X_BODY, 0, 1))


def inner_profile(x):
    """(a, b, n) of the INNER air path at x (extends past both ends)."""
    if x <= X_INNER_BODY:
        ao, bo, no = outer_profile(max(x, TIP_R_OUT))
        t = wall(x)
        a, b = ao - t, bo - t
        n = max(no - 1.0, 2.0)                 # rounder inside -> thicker corners
        if x < TIP_R_IN:                       # small flare at the opening
            d = TIP_R_IN - np.sqrt(max(TIP_R_IN**2 - (TIP_R_IN - x) ** 2, 0.0))
            a, b = a + d, b + d
        return a, b, n
    if x <= X_STOP_CH:
        s = (x - X_INNER_BODY) / (X_STOP_CH - X_INNER_BODY)
        ao, bo, no = outer_profile(X_BODY)
        a0, b0 = ao - WALL_BODY, bo - WALL_BODY
        n0 = max(no - 1.0, 2.0)
        sa = smooth(s ** 1.35)
        sb = smooth(s ** 0.85)
        return lerp(a0, STOP_R, sa), lerp(b0, STOP_R, sb), lerp(n0, 2.0, smooth(s))
    if x <= X_STOP:                            # 45deg stop shoulder (prints w/o support)
        r = STOP_R + (x - X_STOP_CH)
        return r, r, 2.0
    # tapered socket
    s = (x - X_STOP) / BORE_DEPTH
    r = lerp(BORE_D_BOTTOM / 2, BORE_D_MOUTH / 2, s)
    if x > L - LEAD_IN:
        r += x - (L - LEAD_IN)
    return r, r, 2.0


def ring(a, b, n, nseg=NSEG):
    t = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    e = 2.0 / n
    y = a * np.sign(c) * np.abs(c) ** e
    z = b * np.sign(s) * np.abs(s) ** e
    return y, z


def loft(xs, prof):
    """Closed solid from a list of stations; planar caps at both ends."""
    rings = []
    for x in xs:
        a, b, n = prof(x)
        y, z = ring(a, b, n)
        rings.append(np.column_stack([np.full(NSEG, x), y, z]))
    V = np.vstack(rings + [[xs[0], 0, 0], [xs[-1], 0, 0]])
    F = []
    k = len(xs)
    for i in range(k - 1):
        for j in range(NSEG):
            p0 = i * NSEG + j
            p1 = i * NSEG + (j + 1) % NSEG
            q0, q1 = p0 + NSEG, p1 + NSEG
            F += [[p0, q0, q1], [p0, q1, p1]]
    c0, c1 = k * NSEG, k * NSEG + 1
    for j in range(NSEG):
        F.append([c0, j, (j + 1) % NSEG])
        F.append([c1, (k - 1) * NSEG + (j + 1) % NSEG, (k - 1) * NSEG + j])
    F = np.array(F, dtype=np.uint32)
    mesh = Mesh(vert_properties=V.astype(np.float32), tri_verts=F)
    solid = Manifold(mesh)
    if solid.volume() < 0:
        F = F[:, ::-1].copy()
        solid = Manifold(Mesh(vert_properties=V.astype(np.float32), tri_verts=F))
    assert solid.status() == m3d.Error.NoError, solid.status()
    return solid


def stations(x0, x1, breaks, step=0.8, fine=0.1, fine_zone=1.5):
    xs = set(np.round(np.arange(x0, x1 + 1e-9, step), 4))
    for bk in breaks:
        for d in np.arange(-fine_zone, fine_zone + 1e-9, fine):
            if x0 <= bk + d <= x1:
                xs.add(round(bk + d, 4))
    xs.update([x0, x1])
    return np.array(sorted(xs))


def logo_solid():
    fp = FontProperties(fname=FONT)
    tp = TextPath((0, 0), LOGO, size=1.0, prop=fp)
    polys = [p for p in tp.to_polygons(closed_only=True) if len(p) >= 3]
    allp = np.vstack(polys)
    # scale to the requested overall text length
    sc = LOGO_LEN / (allp[:, 0].max() - allp[:, 0].min())
    cx = (allp[:, 0].max() + allp[:, 0].min()) / 2
    cy = (allp[:, 1].max() + allp[:, 1].min()) / 2
    polys = [((p - [cx, cy]) * sc).astype(np.float64) for p in polys]
    cs = CrossSection(polys, FillRule.EvenOdd)
    # u along X, v along arc (Z when seen from -Y), w = radial (extrude axis)
    depth_in, out = LOGO_DEPTH, 1.5
    txt = Manifold.extrude(cs, depth_in + out).translate([0, 0, -depth_in])
    txt = txt.refine_to_length(0.6)
    R = R_COLLAR

    def wrap(p):
        u, v, w = p[0], p[1], p[2]
        th = v / R
        rr = R + w
        # text faces -Y; reading direction +X when viewed from -Y with Z up
        return [LOGO_X + u, -rr * np.cos(th), rr * np.sin(th)]

    return txt.warp(wrap), sc, (allp[:, 0].max() - allp[:, 0].min()) * sc


def build():
    xs_o = stations(0.0, L, [0.0, X_BODY, X_COLLAR, X_COLLAR + (R_COLLAR - R_TRANS0), L - 1.0, L])
    outer = loft(xs_o, outer_profile)
    xs_i = stations(-1.0, L + 1.0, [0.0, X_BODY, X_STOP_CH, X_STOP, L - LEAD_IN, L])
    inner = loft(xs_i, inner_profile)
    part = outer - inner
    logo, sc, logo_len = logo_solid()
    part = part - logo
    assert part.status() == m3d.Error.NoError
    return part, logo_len


def to_trimesh(man):
    import trimesh
    mm = man.to_mesh()
    return trimesh.Trimesh(np.array(mm.vert_properties)[:, :3], np.array(mm.tri_verts), process=True)


if __name__ == "__main__":
    import trimesh
    part, logo_len = build()
    tm = to_trimesh(part)
    out = os.path.join(HERE, "ANX3D_sofa_crevice_nozzle.stl")
    tm.export(out)
    print("STL:", out)
    print("triangles:", len(tm.faces))
    print("watertight:", tm.is_watertight, "winding ok:", tm.is_winding_consistent,
          "volume>0:", tm.volume > 0, "bodies:", len(tm.split(only_watertight=False)))
    print("genus:", part.genus(), " volume cm3: %.1f" % (tm.volume / 1000))
    print("bbox:", np.round(tm.bounds, 2).tolist())
    print("logo length: %.1f mm" % logo_len)
