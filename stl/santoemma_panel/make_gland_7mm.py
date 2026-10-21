"""Printable cable gland for the 16.4 mm power-cable hole of the Santoemma panel, for 7 / 8 / 9 mm cables. No collet fingers.
Body: 16 mm thread through the panel (22 AF flange on the front, lock nut behind) and a 20 mm thread for the cap.
Clamp: two solid half-cones (split wedge, grip ridges inside) that sit around the cable on top of the body.
Cap: knurled dome nut with an INTERNAL thread and an inner cone - screwing it down presses the two halves together
onto the cable. Every part is solid and prints without supports (the halves lie on their flat split face).
Thread profile / helpers from ../shurflo_box/make_gland.py.
Parts: gland7_body, gland7_cap, gland7_locknut, gland7_wedge_half (print 2) - PETG/ASA. (file names kept from the 7 mm version)
Run:  python3 make_gland_7mm.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shurflo_box'))
from manifold3d import Manifold
from make_gland import thread, hexagon, knurled, R1, R2, CLEAR, FLANGE_AF, FLANGE_T, SEG
from make_box import cyl, export

CABLE_MIN, CABLE_MAX = 7.0, 9.0   # cable range: 9 mm grips after ~8 mm of cap thread, 7 mm with the cap tight
WALL_T = 13.0                     # thread through the panel: 5 mm wall + 5 mm lock nut + 3 mm spare (10 mm panel: 5 mm at the hole)
CAP_T = 14.0                      # cap thread length (OD 20): long, so the cone travels far enough for the whole range
BODY_BORE = CABLE_MAX + 1.0       # bore through the body, 10
WEDGE_L, WEDGE_D0, WEDGE_D1 = 12.0, 14.6, 10.6   # split wedge, closed: length, bottom OD, top OD (9.5 deg taper)
WEDGE_BORE, RIDGE_D = 6.4, 5.8    # closed bore + two grip ridges: the halves stand 0.6 (7 mm) .. 1.6 mm (9 mm) out on the cable
CONE_GAP = 0.05                   # cap cone 0.05 mm outside the closed wedge: on a 7 mm cable the ridges bite 0.55 mm with the cap tight
CAP_H = CAP_T + WEDGE_L + 2.0

def make_body():                  # modelled with the panel thread at z = 0..WALL_T, cap thread on top, flat top for the wedge
    z_fl = WALL_T; z_c = z_fl + FLANGE_T
    b = thread(R1, WALL_T) + hexagon(FLANGE_AF, FLANGE_T, z_fl) + thread(R2, CAP_T).translate([0, 0, z_c])
    b -= cyl(BODY_BORE/2, -1, z_c+CAP_T+1)
    return b

def make_wedge():                 # the closed split wedge, axis on z, wide end at z = 0
    w = Manifold.cylinder(WEDGE_L, WEDGE_D0/2, WEDGE_D1/2, SEG) - cyl(WEDGE_BORE/2, -1, WEDGE_L+1)
    for zr in (WEDGE_L*0.3, WEDGE_L*0.7):                                                  # two grip ridges, 45 deg flanks
        h = (WEDGE_BORE-RIDGE_D)/2
        w += (Manifold.cylinder(h, WEDGE_BORE/2, RIDGE_D/2, SEG).translate([0, 0, zr-h]) +
              Manifold.cylinder(h, RIDGE_D/2, WEDGE_BORE/2, SEG).translate([0, 0, zr])) - cyl(RIDGE_D/2, zr-h-1, zr+h+1)
    w -= Manifold.cylinder(0.6, WEDGE_D0/2+1, WEDGE_D0/2-0.4, SEG).translate([0, 0, -0.01])  # small chamfer, no elephant foot bite
    return w

def make_wedge_half():            # one half (y > 0), split face on the bed
    half = make_wedge() ^ Manifold.cube([40, 20, 40]).translate([-20, 0, -5])
    half = half.rotate([90, 0, 0])                                                         # y -> z: split face down
    return half.translate([0, 0, -half.bounding_box()[2]])

def make_cap():                   # knurled dome nut: internal thread at the open end, cone above it, printed open end down
    c = knurled(14.0, CAP_H)
    c -= thread(R2, CAP_T+1, extra=CLEAR).translate([0, 0, -0.5])                            # internal thread
    c -= Manifold.cylinder(1.0, R2+0.6+CLEAR+1.0, R2+0.6+CLEAR, SEG).translate([0, 0, -0.01])  # lead-in chamfer
    c -= Manifold.cylinder(WEDGE_L+0.01, WEDGE_D0/2+CONE_GAP, WEDGE_D1/2+CONE_GAP, SEG).translate([0, 0, CAP_T])
    c -= cyl(CABLE_MAX/2+0.3, 0, CAP_H+1)
    return c

def make_locknut():
    return hexagon(FLANGE_AF, 5.0) - thread(R1, 7, extra=CLEAR).translate([0, 0, -1])

if __name__ == '__main__':
    body = make_body()
    top = body.bounding_box()[5]
    export(body.rotate([180, 0, 0]).translate([0, 0, top]), 'gland7_body.stl')   # cap-thread end on the bed
    export(make_cap(), 'gland7_cap.stl')
    export(make_locknut(), 'gland7_locknut.stl')
    export(make_wedge_half(), 'gland7_wedge_half.stl')
