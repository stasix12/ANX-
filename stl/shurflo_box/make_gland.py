"""Printable cable gland for the 16.4 mm power hole in the ANX3D Shurflo box (cable ~6-9 mm).
Parts: gland_body (PETG/ASA), gland_cap (PETG/ASA), gland_locknut (PETG/ASA), gland_seal_TPU (TPU 95A).
Threads are a rounded single-start profile (eccentric circle + twist), 2.5 mm pitch: prints cleanly without supports.
Run:  python3 make_gland.py"""
import numpy as np
from manifold3d import Manifold, CrossSection
from make_box import cyl, export

CABLE_D = 8.0                     # cable OD the seal is sized for (works ~6.5-9 mm)
PITCH, ECC, CLEAR = 2.5, 0.6, 0.35   # thread pitch, eccentricity (thread depth = 2*ECC), radial clearance male/female
WALL_T = 16.0                     # body thread length: 3.2 mm box wall + 5 mm lock nut + spare
R1 = 8.0 - ECC                    # through-wall thread, max OD 16.0 (hole 16.4)
R2 = 10.0 - ECC                   # cap thread, max OD 20.0
FLANGE_AF, FLANGE_T = 22.0, 4.0
CAP_T = 10.0                      # cap thread length
FING_L, FING_D0, FING_D1 = 10.0, 17.0, 13.5   # collet fingers: length, base OD, tip OD
SEAL_OD, SEAL_L = 13.0, 10.0
SEG = 96

def thread(r, length, extra=0.0):  # male rounded thread along +Z, 0..length
    cs = CrossSection.circle(r+extra, SEG).translate([ECC, 0])
    return cs.extrude(length, n_divisions=int(length/0.2), twist_degrees=360*length/PITCH)

def hexagon(af, h, z0=0):
    return CrossSection.circle(af/np.sqrt(3), 6).extrude(h).translate([0, 0, z0])

def knurled(r, h, n=24):          # grippy round nut
    body = CrossSection.circle(r, SEG)
    ribs = [CrossSection.circle(1.0, 16).translate([r*np.cos(a), r*np.sin(a)]) for a in np.linspace(0, 2*np.pi, n, endpoint=False)]
    return (body + sum(ribs[1:], ribs[0])).extrude(h)

def make_body():                  # modelled wall-thread at z=0; exported upside down (finger tips on the bed)
    z_fl, z_t2 = WALL_T, WALL_T + FLANGE_T
    b = thread(R1, WALL_T)
    b += hexagon(FLANGE_AF, FLANGE_T, z_fl)
    b += thread(R2, CAP_T).translate([0, 0, z_t2])
    z_f = z_t2 + CAP_T
    b += Manifold.cylinder(FING_L, FING_D0/2, FING_D1/2, SEG).translate([0, 0, z_f])
    b -= cyl(CABLE_D/2+1.2, -1, z_f+FING_L+1)                                   # cable bore
    b -= cyl(SEAL_OD/2+0.2, z_f+FING_L-SEAL_L-2, z_f+FING_L+1)                  # seal pocket inside the fingers
    for a in range(6):                                                          # 6 collet slots
        b -= Manifold.cube([1.6, 20, FING_L+0.1]).translate([-0.8, 0, z_f+0.1]).rotate([0, 0, a*60])
    return b

def make_cap():                   # dome nut, printed open side down
    h = CAP_T + FING_L - 1 + 2.0
    c = knurled(13.0, h)
    c -= thread(R2, CAP_T+1, extra=CLEAR).translate([0, 0, -0.5])               # female thread
    cone_z0 = CAP_T
    c -= Manifold.cylinder(FING_L-1+0.01, FING_D0/2+0.3, FING_D1/2-0.9, SEG).translate([0, 0, cone_z0])  # squeezes the fingers
    c -= cyl(CABLE_D/2+0.8, 0, h+1)
    return c

def make_locknut():
    n = hexagon(FLANGE_AF, 5.0)
    n -= thread(R1, 7, extra=CLEAR).translate([0, 0, -1])
    return n

def make_seal():                  # TPU sleeve: squeezed onto the cable by the fingers
    return cyl(SEAL_OD/2, 0, SEAL_L) - cyl(CABLE_D/2-0.6, -1, SEAL_L+1)

if __name__ == '__main__':
    body = make_body()
    export(body.rotate([180, 0, 0]).translate([0, 0, body.bounding_box()[5]]), 'gland_body.stl')
    export(make_cap(), 'gland_cap.stl')
    export(make_locknut(), 'gland_locknut.stl')
    export(make_seal(), 'gland_seal_TPU.stl')
