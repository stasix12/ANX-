"""Printable cable gland for the 16.4 mm power-cable hole of the Santoemma panel, 7 mm cable.
Body: 16 mm thread through the panel (22 AF flange on the front, lock nut behind), 20 mm thread for the cap and six
rigid collet fingers with three grip ridges inside. Cap: knurled dome nut with an INTERNAL thread and an inner cone -
screwing it down closes the fingers onto the cable (no rubber needed; the grip comes from the PETG fingers).
Thread profile / helpers from ../shurflo_box/make_gland.py.  Parts: gland7_body, gland7_cap, gland7_locknut (PETG/ASA).
Run:  python3 make_gland_7mm.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shurflo_box'))
import numpy as np
from manifold3d import Manifold, CrossSection
from make_gland import thread, hexagon, knurled, R1, R2, CLEAR, FLANGE_AF, FLANGE_T, SEG
from make_box import cyl, export

CABLE_D = 7.0
WALL_T = 13.0                     # thread through the panel: 5 mm wall + 5 mm lock nut + 3 mm spare (10 mm panel: 5 mm at the hole)
CAP_T = 10.0                      # cap thread length (OD 20)
FING_L, FING_D0, FING_D1 = 12.0, 16.0, 13.0      # collet fingers: length, base OD, tip OD
FING_BORE = CABLE_D + 0.8         # finger bore at rest, 7.8
RIDGE_D = CABLE_D + 0.2           # grip ridges: 7.2 at rest (cable slides through), close to 5.6 when the cap is tight
BODY_BORE = CABLE_D + 2.0         # bore through the panel thread
CONE_D0, CONE_D1 = FING_D0 + 0.6, FING_D1 - 1.6  # cap cone: at the finger base / tip -> max 0.8 mm radial squeeze at the tips
CAP_H = CAP_T + FING_L + 2.0

def make_body():                  # modelled with the panel thread at z = 0..WALL_T
    z_fl = WALL_T; z_c = z_fl + FLANGE_T; z_f = z_c + CAP_T
    b = thread(R1, WALL_T) + hexagon(FLANGE_AF, FLANGE_T, z_fl) + thread(R2, CAP_T).translate([0, 0, z_c])
    b += Manifold.cylinder(FING_L, FING_D0/2, FING_D1/2, SEG).translate([0, 0, z_f])
    b -= cyl(BODY_BORE/2, -1, z_f+0.5)
    b -= Manifold.cylinder(1.0, BODY_BORE/2, FING_BORE/2, SEG).translate([0, 0, z_f+0.5])     # step down to the finger bore
    b -= cyl(FING_BORE/2, z_f+1.49, z_f+FING_L+1)
    for zr in (z_f+FING_L-1.5, z_f+FING_L-4.5, z_f+FING_L-7.5):                             # 3 grip ridges (45 deg flanks)
        h = (FING_BORE-RIDGE_D)/2
        ring = Manifold.cylinder(h, FING_BORE/2, RIDGE_D/2, SEG) + Manifold.cylinder(h, RIDGE_D/2, FING_BORE/2, SEG).translate([0, 0, h])
        b += ring.translate([0, 0, zr-h]) - cyl(RIDGE_D/2, zr-h-1, zr+h+1)
    for a in range(6):                                                                       # 6 collet slots
        b -= Manifold.cube([1.6, 20, FING_L+0.1]).translate([-0.8, 0, z_f+0.2]).rotate([0, 0, a*60])
    return b

def make_cap():                   # knurled dome nut: internal thread at the open end, cone above it, printed open end down
    c = knurled(14.0, CAP_H)
    c -= thread(R2, CAP_T+1, extra=CLEAR).translate([0, 0, -0.5])                            # internal thread
    c -= Manifold.cylinder(1.0, R2+0.6+CLEAR+1.0, R2+0.6+CLEAR, SEG).translate([0, 0, -0.01])  # lead-in chamfer
    c -= Manifold.cylinder(FING_L+0.01, CONE_D0/2, CONE_D1/2, SEG).translate([0, 0, CAP_T])   # squeezes the finger tips
    c -= cyl(CABLE_D/2+0.6, 0, CAP_H+1)
    return c

def make_locknut():
    return hexagon(FLANGE_AF, 5.0) - thread(R1, 7, extra=CLEAR).translate([0, 0, -1])

if __name__ == '__main__':
    body = make_body()
    top = body.bounding_box()[5]
    export(body.rotate([180, 0, 0]).translate([0, 0, top]), 'gland7_body.stl')   # finger tips on the bed
    export(make_cap(), 'gland7_cap.stl')
    export(make_locknut(), 'gland7_locknut.stl')
