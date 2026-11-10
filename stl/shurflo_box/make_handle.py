"""Carry handle for the ANX3D Shurflo box. Bolts on with the two middle lid screws (0, +-77):
a spigot drops into each lid counterbore and an M4x60 goes through handle + lid into the base pillar,
so the load goes straight into the base. Four finger hollows under the grip, ANX3D inlaid on top of the grip.
Exported upside down (top of the grip on the bed): the logo is the first 3 layers -> only those need the 2nd colour.
Run:  python3 make_handle.py   ->  carry_handle.stl + carry_handle_logo.stl (load both as one object, 2 parts)"""
import numpy as np
from manifold3d import Manifold, CrossSection
from make_box import PILLARS, SCREW_HEAD, SCREW_CLEAR, export, rrect, text2d, LOGO_FONT

SPAN = 2*abs(PILLARS[-1][1])      # 154 mm between the middle lid screws
T = 24.0                          # handle thickness (along the box length)
GRIP_Z, GRIP_R = 51.0, 11.0       # grip centre height above the lid, half-thickness -> 40 mm finger clearance
TOP = GRIP_Z + GRIP_R             # top of the grip (62 mm above the lid)
LEG_X = SPAN/2 - 25               # where the grip ends meet the legs
EDGE = 3.0                        # rounded edges
FINGERS = (-33.0, -11.0, 11.0, 33.0)   # finger hollows under the grip, 22 mm apart
FINGER_R, FINGER_DEPTH = 12.0, 3.0
INLAY = 0.6                       # logo depth: 3 layers at 0.2 mm
SEG = 64

def profile():                    # side view: u = across the box, v = up from the lid top
    h = SPAN/2
    shape = CrossSection()
    for s in (-1, 1):
        foot = CrossSection.batch_hull([CrossSection.square([18, 10]).translate([s*(h-1) - 9, 0]),   # pad around the screw
                                        CrossSection.square([0.5, 0.5]).translate([s*(h-10) - 0.25, 27.5])])  # 45deg gusset: prints upside down
        leg = CrossSection.batch_hull([CrossSection.square([12, 10]).translate([s*(h-13) - 6, 4]),   # inboard, 4 mm up: clears a raised lid panel
                                       CrossSection.circle(GRIP_R, SEG).translate([s*LEG_X, GRIP_Z])])
        shape += foot + leg
    shape += CrossSection.batch_hull([CrossSection.circle(GRIP_R, SEG).translate([-LEG_X, GRIP_Z]),
                                      CrossSection.circle(GRIP_R, SEG).translate([LEG_X, GRIP_Z])])
    hand = rrect(2*(h-21), 2*(GRIP_Z-GRIP_R), 10)                                      # finger opening
    for u in FINGERS:                                                                   # finger hollows in the underside of the grip
        hand += CrossSection.circle(FINGER_R, SEG).translate([u, GRIP_Z-GRIP_R+FINGER_DEPTH-FINGER_R])
    return shape - hand

def logo_inlay(extra=0.0):        # ANX3D on top of the grip, flush, reading left-to-right from the front of the box
    t = text2d('ANX3D', 14, LOGO_FONT)
    return t.extrude(INLAY + extra).transform(np.array([[1, 0, 0, 0], [0, 0, 1, TOP-INLAY], [0, -1, 0, T/2]], float))

def make_handle():
    p = profile()
    n = 6                         # stacked offsets -> rounded edges on both faces
    layers = []
    for i in range(n):
        d = EDGE*(i+0.5)/n                                  # distance of this layer from the face
        inset = EDGE - np.sqrt(EDGE**2 - (EDGE-d)**2)
        sl = p.offset(-inset).extrude(EDGE/n+0.01)
        layers += [sl.translate([0, 0, EDGE*i/n]), sl.translate([0, 0, T-EDGE*(i+1)/n])]
    body = p.extrude(T-2*EDGE+0.02).translate([0, 0, EDGE-0.01])
    h = sum(layers, body)
    along_v = lambda r, v0, v1, u: Manifold.cylinder(v1-v0, r, r, SEG).rotate([-90, 0, 0]).translate([u, v0, T/2])
    for s in (-1, 1):
        u = s*SPAN/2
        h += along_v(4.1, -8, 0.5, u)                     # spigot into the lid's 8.6 mm counterbore (prints upright now)
        h -= along_v(SCREW_CLEAR/2, -9, 20, u)            # M4 clearance
        h -= along_v(SCREW_HEAD/2+0.4, 4, 40, u)          # screw head seat 4 mm above the lid, open from above
    return h - logo_inlay(extra=1.0)                      # pocket for the coloured logo

PRINT = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, TOP]], float)   # upside down: top of the grip on the bed

if __name__ == '__main__':
    export(make_handle().transform(PRINT), 'carry_handle.stl')
    export(logo_inlay().transform(PRINT), 'carry_handle_logo.stl')
