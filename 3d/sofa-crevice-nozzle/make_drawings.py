"""Dimensioned section drawing + wall-thickness check from the exported STL."""
import os
import numpy as np
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly
from shapely.geometry import Polygon

import build_nozzle as B

HERE = os.path.dirname(os.path.abspath(__file__))
tm = trimesh.load(os.path.join(HERE, "ANX3D_sofa_crevice_nozzle.stl"))

ORANGE, DARK, DIM = "#d9822b", "#2b2d31", "#1f5fbf"


def section_polys(origin, normal, to2d):
    s = tm.section(plane_origin=origin, plane_normal=normal)
    out = []
    for e in s.discrete:
        out.append(np.array([to2d(p) for p in e]))
    return out


def draw_section(ax, polys):
    # largest loops are the wall outline; fill with even-odd via shapely
    shp = [Polygon(p) for p in polys if len(p) > 3]
    shp.sort(key=lambda g: -g.area)
    solid = None
    for g in shp:
        g = g.buffer(0)
        solid = g if solid is None else solid.symmetric_difference(g)
    geoms = getattr(solid, "geoms", [solid])
    for g in geoms:
        ax.add_patch(MPoly(np.array(g.exterior.coords), fc=ORANGE, ec=DARK, lw=0.6))
        for i in g.interiors:
            ax.add_patch(MPoly(np.array(i.coords), fc="white", ec=DARK, lw=0.6))
    return solid


def dim_h(ax, x0, x1, y, txt, off=0):
    ax.annotate("", (x0, y), (x1, y), arrowprops=dict(arrowstyle="<->", color=DIM, lw=0.9, shrinkA=0, shrinkB=0))
    ax.text((x0 + x1) / 2 + off, y + 1.2, txt, color=DIM, ha="center", va="bottom", fontsize=8)


def dim_v(ax, x, y0, y1, txt, side=1):
    ax.annotate("", (x, y0), (x, y1), arrowprops=dict(arrowstyle="<->", color=DIM, lw=0.9, shrinkA=0, shrinkB=0))
    ax.text(x + 1.5 * side, (y0 + y1) / 2, txt, color=DIM, ha="left" if side > 0 else "right", va="center", fontsize=8)


def ext(ax, x0, y0, x1, y1):
    ax.plot([x0, x1], [y0, y1], color=DIM, lw=0.4)


# ---------------------------------------------------------- wall thickness scan
xs = np.arange(0.5, 250, 0.5)
wall_min, profile = [], []
for x in xs:
    polys = section_polys([x, 0, 0], [1, 0, 0], lambda p: (p[1], p[2]))
    shp = sorted([Polygon(p).buffer(0) for p in polys], key=lambda g: -g.area)
    if len(shp) < 2:
        wall_min.append(np.nan)
        continue
    outer, inner = shp[0], shp[1]
    wall_min.append(outer.exterior.distance(inner.exterior))
wall_min = np.array(wall_min)

# ---------------------------------------------------------- sheet 1: sections
fig = plt.figure(figsize=(16.5, 11.7), dpi=130)
fig.suptitle("ANX3D  |  Sofa crevice nozzle  -  sections & key dimensions (mm)", fontsize=14, fontweight="bold", x=0.02, ha="left")

# A: longitudinal section in the height plane (XZ, y=0)
ax = fig.add_axes([0.03, 0.62, 0.94, 0.30])
draw_section(ax, section_polys([0, 0, 0], [0, 1, 0], lambda p: (p[0], p[2])))
ax.set_title("A-A  Longitudinal section, height plane (cut at Y=0)  -  wall thickness & air path", loc="left", fontsize=10)
dim_h(ax, 0, 250, 30, "250 overall")
for xx in (0, 250):
    ext(ax, xx, 24, xx, 31)
dim_h(ax, B.X_COLLAR, 250, 25, "45 collar")
ext(ax, B.X_COLLAR, 21.5, B.X_COLLAR, 26)
dim_h(ax, B.X_BODY, B.X_COLLAR, 25, "80 transition")
ext(ax, B.X_BODY, 11, B.X_BODY, 26)
dim_h(ax, B.X_STOP, 250, -27, "38 socket depth")
ext(ax, B.X_STOP, -18, B.X_STOP, -28)
ext(ax, 250, -23, 250, -28)
dim_v(ax, -4, -6, 6, "12", side=-1)
dim_v(ax, B.X_BODY - 3, -10, 10, "20", side=-1)
dim_v(ax, 254, -23, 23, "Ø46 OD")
dim_v(ax, 238, -B.BORE_D_MOUTH / 2 + 0.4, B.BORE_D_MOUTH / 2 - 0.4, "Ø36.0 straight bore\n(1 mm lead-in chamfer)", side=-1)
ax.text(30, -14, "wall 3.0 at tip  >  4.0 at x=125  >  4.0-6.7 in transition (8 at hose stop)  >  4.75-5.0 collar",
        fontsize=8.5, color=DARK)
ax.text(181, 6.5, "air path", fontsize=8, color=DARK, ha="center")
ax.annotate("45° hose stop\n(3 mm shoulder)", (B.X_STOP - 1.5, 16.5), (176, 31), fontsize=8,
            arrowprops=dict(arrowstyle="->", lw=0.7), color=DARK)
ax.set_xlim(-14, 272); ax.set_ylim(-33, 38); ax.set_aspect("equal"); ax.axis("off")

# B: longitudinal section in the width plane (XY, z=0)
ax = fig.add_axes([0.03, 0.33, 0.94, 0.28])
draw_section(ax, section_polys([0, 0, 0], [0, 0, 1], lambda p: (p[0], p[1])))
ax.set_title("B-B  Longitudinal section, width plane (cut at Z=0)  -  logo engraving visible at the collar (bottom edge)", loc="left", fontsize=10)
dim_v(ax, -4, -11, 11, "22", side=-1)
dim_v(ax, B.X_BODY - 3, -13, 13, "26", side=-1)
ax.annotate("ANX3D engraved 0.6 deep\n(wall under logo 4.4)", (228, -23), (150, -31), fontsize=8,
            arrowprops=dict(arrowstyle="->", lw=0.7), color=DARK)
ax.set_xlim(-14, 272); ax.set_ylim(-35, 30); ax.set_aspect("equal"); ax.axis("off")

# C: cross sections
stations = [(1.0, "x=1 (opening)"), (60, "x=60 (blade)"), (125, "x=125 (blade end)"),
            (165, "x=165 (transition)"), (200, "x=200 (critical zone)"), (230, "x=230 (socket + logo)")]
for i, (x, lab) in enumerate(stations):
    ax = fig.add_axes([0.03 + i * 0.16, 0.06, 0.15, 0.22])
    solid = draw_section(ax, section_polys([x, 0, 0], [1, 0, 0], lambda p: (p[1], p[2])))
    ib = [Polygon(i_).bounds for i_ in [g for g in solid.interiors]] if hasattr(solid, "interiors") else []
    ob = solid.bounds
    k = int(np.argmin(np.abs(xs - x)))
    txt = f"{lab}\nouter {ob[2]-ob[0]:.1f} x {ob[3]-ob[1]:.1f}"
    if ib:
        txt += f"\nair {ib[0][2]-ib[0][0]:.1f} x {ib[0][3]-ib[0][1]:.1f}"
    txt += f"\nmin wall {wall_min[k]:.2f}"
    ax.set_title(txt, fontsize=8.5)
    ax.set_xlim(-25, 25); ax.set_ylim(-25, 25); ax.set_aspect("equal"); ax.axis("off")
fig.text(0.03, 0.02, "C  Cross-sections (viewed from the tip). Orange = solid material, white = air path.", fontsize=9)
fig.savefig(os.path.join(HERE, "drawing_sections.png"), bbox_inches="tight")

# ---------------------------------------------------------- sheet 2: wall plot
fig, ax = plt.subplots(figsize=(11, 3.6), dpi=130)
ax.plot(xs, wall_min, color=ORANGE, lw=2)
ax.axhline(3.0, color="#999", ls="--", lw=0.8)
for xx, lab in [(B.X_BODY, "blade | transition"), (B.X_COLLAR, "transition | collar"), (B.X_STOP, "hose stop")]:
    ax.axvline(xx, color="#bbb", lw=0.8); ax.text(xx + 1, ax.get_ylim()[1] if False else 8.6, lab, fontsize=8, color="#555")
ax.set_xlim(0, 250); ax.set_ylim(0, 9.5)
ax.set_xlabel("position along nozzle, x (mm)  -  0 = suction tip, 250 = hose end")
ax.set_ylabel("min wall (mm)")
ax.set_title("Minimum wall thickness along the part (measured on the exported STL, 0.5 mm steps)", fontsize=10)
ax.grid(alpha=0.25)
fig.savefig(os.path.join(HERE, "drawing_wall_thickness.png"), bbox_inches="tight")

ok = ~np.isnan(wall_min)
print("min wall overall %.2f at x=%.1f" % (np.nanmin(wall_min), xs[ok][np.argmin(wall_min[ok])]))
for a, b in [(0, 5), (5, B.X_BODY), (B.X_BODY, B.X_COLLAR), (B.X_COLLAR, 250)]:
    m = (xs >= a) & (xs < b)
    print("x %5.1f-%5.1f : min %.2f  max %.2f" % (a, b, np.nanmin(wall_min[m]), np.nanmax(wall_min[m])))
