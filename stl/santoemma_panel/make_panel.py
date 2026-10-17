"""ANX3D flat replacement panel for the Santoemma injection-extraction machine (control plate).
258 x 175 mm plate, viewed from the front: power cable hole middle-left, two rocker switches top-right,
44 mm and 32 mm round holes stacked below them on the right. 6 x M4 holes on the rim.
Run:  python3 make_panel.py   ->  panel.stl (front face down on the bed)."""
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection, JoinType

PW, PH, T, R = 258.0, 175.0, 4.0, 8.0     # width, height, thickness, corner radius
SWITCH_W, SWITCH_H = 22.2, 30.2           # same snap-in rocker cutout as the Shurflo box / previous frame
SWITCH_PANEL = 2.0                        # plate thinned to 2 mm around each cutout so the clips catch
SWITCHES = [(62.0, 50.0), (96.0, 50.0)]   # (x, y) centres, top-right, side by side
ROUND = [(79.0, 0.0, 44.0), (79.0, -50.0, 32.0)]   # (x, y, dia) right side: 44 above, 32 below
CABLE = (-104.0, 0.0, 16.4)               # middle of the left side, M16 gland
SCREW = 4.5                               # M4 clearance
SCREWS = [(sx*(PW/2-8), sy*(PH/2-8)) for sx in (-1, 1) for sy in (-1, 1)] + [(0, PH/2-8), (0, -(PH/2-8))]
SEG = 96

def rrect(w, h, r):
    return CrossSection.square([w-2*r, h-2*r], center=True).offset(r, JoinType.Round, circular_segments=SEG)

def circle(d, x, y):
    return CrossSection.circle(d/2, SEG).translate([x, y])

def make_panel():                         # z = 0 is the front face
    holes = [CrossSection.square([SWITCH_W, SWITCH_H], center=True).translate([x, y]) for x, y in SWITCHES]
    holes += [circle(d, x, y) for x, y, d in ROUND] + [circle(CABLE[2], CABLE[0], CABLE[1])]
    holes += [circle(SCREW, x, y) for x, y in SCREWS]
    plate = (rrect(PW, PH, R) - CrossSection.compose(holes)).extrude(T)
    for x, y in SWITCHES:                 # back-side pocket: 2 mm left at the cutout
        plate -= rrect(SWITCH_W+8, SWITCH_H+8, 2).translate([x, y]).extrude(T).translate([0, 0, SWITCH_PANEL])
    return plate

def to_trimesh(m):
    x = m.to_mesh(); return trimesh.Trimesh(np.asarray(x.vert_properties)[:, :3], np.asarray(x.tri_verts))

if __name__ == '__main__':
    p = to_trimesh(make_panel()); p.export('panel.stl')
    print('panel.stl', p.bounds.round(2).tolist(), 'watertight', p.is_watertight)
