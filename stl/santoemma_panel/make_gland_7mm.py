"""Printable cable gland for the 16.4 mm power-cable hole of the Santoemma panel, 7 mm cable, internal thread.
The body goes through the panel (16 mm thread, 22 AF flange on the front, lock nut behind) and carries a socket with an
INTERNAL thread on the outside. A hollow pressure screw (knurled head) screws into the socket and pushes a TPU sleeve
down a 45 deg cone, which squeezes it onto the cable. Thread profile / helpers from ../shurflo_box/make_gland.py.
Parts: gland7_body, gland7_screw, gland7_locknut (PETG/ASA), gland7_seal_TPU (TPU 95A). All print without supports.
Run:  python3 make_gland_7mm.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shurflo_box'))
from manifold3d import Manifold
from make_gland import thread, hexagon, knurled, R1, CLEAR, ECC, FLANGE_AF, FLANGE_T, SEG
from make_box import cyl, export

CABLE_D = 7.0
WALL_T = 13.0                     # thread through the panel: 5 mm wall + 5 mm lock nut + 3 mm spare (10 mm panel: 5 mm at the hole)
BORE = CABLE_D + 0.6              # cable bore through body and screw
SOCK_OD, SOCK_T = 22.0, 18.0      # socket above the flange: cone 3.2 + seal chamber 2.8 + internal thread 12
CHAMBER = 14.0                    # seal chamber dia (internal thread minor dia is ~14.3)
FEM_L = 12.0                      # internal thread length
SEAL_OD, SEAL_ID, SEAL_L = 13.6, CABLE_D - 0.6, 10.0
SCREW_L, HEAD_R, HEAD_T = 12.0, 12.0, 7.0

def make_body():                  # modelled with the panel thread at z = 0..WALL_T, flange, socket on top
    z_fl, z_s = WALL_T, WALL_T + FLANGE_T
    b = thread(R1, WALL_T) + hexagon(FLANGE_AF, FLANGE_T, z_fl) + cyl(SOCK_OD/2, z_s-0.01, z_s+SOCK_T)
    cone = (CHAMBER - BORE)/2
    b -= cyl(BORE/2, -1, z_s+1)
    b -= Manifold.cylinder(cone+0.01, BORE/2, CHAMBER/2, SEG).translate([0, 0, z_s])                  # 45 deg seal seat
    b -= cyl(CHAMBER/2, z_s+cone, z_s+SOCK_T+1)
    b -= thread(R1, FEM_L+1, extra=CLEAR).translate([0, 0, z_s+SOCK_T-FEM_L])                          # internal thread
    b -= Manifold.cylinder(1.0, R1+ECC+CLEAR, R1+ECC+CLEAR+1.0, SEG).translate([0, 0, z_s+SOCK_T-0.99])  # lead-in chamfer
    return b

def make_screw():                 # hollow pressure screw: knurled head on the bed, thread up
    s = knurled(HEAD_R, HEAD_T) + thread(R1, SCREW_L).translate([0, 0, HEAD_T-0.01])
    return s - cyl(BORE/2+0.2, -1, HEAD_T+SCREW_L+1)

def make_locknut():
    return hexagon(FLANGE_AF, 5.0) - thread(R1, 7, extra=CLEAR).translate([0, 0, -1])

def make_seal():                  # TPU sleeve, 45 deg nose that sits in the body's cone
    nose = (SEAL_OD - BORE)/2
    s = Manifold.cylinder(nose, BORE/2, SEAL_OD/2, SEG) + cyl(SEAL_OD/2, nose-0.01, SEAL_L)
    return s - cyl(SEAL_ID/2, -1, SEAL_L+1)

if __name__ == '__main__':
    body = make_body()
    top = body.bounding_box()[5]
    export(body.rotate([180, 0, 0]).translate([0, 0, top]), 'gland7_body.stl')   # socket opening on the bed
    export(make_screw(), 'gland7_screw.stl')
    export(make_locknut(), 'gland7_locknut.stl')
    export(make_seal(), 'gland7_seal_TPU.stl')
