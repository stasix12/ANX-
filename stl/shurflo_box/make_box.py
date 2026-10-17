"""ANX3D enclosure for a Shurflo diaphragm pump 8095-901-890 (230 VAC, ~190 x 96 x 89 mm on its flat bracket).
Outer body 230 x 170 x 120 mm (widened from 140 so the pump fits with a PL 3/8" push-in elbow on each port): base (82 mm) + lid (38 mm), joined by 6 x M4 screws.
Front face (left -> right): outlet | power rocker switch | inlet (35 mm panel-frame holes), Hebrew labels engraved above.
Run:  python3 make_box.py   ->  base.stl, lid.stl (lid already flipped for printing)."""
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection, FillRule, JoinType
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties

L, D, H = 230.0, 170.0, 120.0     # outer body (feet extend beyond D)
HB = 82.0                         # base height (lid = H - HB)
W = 4.0                           # wall / floor thickness
R = 10.0                          # outer corner radius
GLAND_Z = 40.0                    # gland hole centre height
WATER_HOLE = 35.0                 # water fittings: same panel-frame hole as the Turbo-X panel
GLANDS = [(-38, WATER_HOLE, 'יציאה'),     # (y, hole dia, label)  - viewed from the front: left -> right
          (38,  WATER_HOLE, 'כניסה')]     # outlet left, inlet right
SWITCH = (0.0, 22.2, 30.2, 'חשמל')        # (y, cutout W, cutout H, label): snap-in rocker switch in the middle
SWITCH_PANEL = 2.0                        # wall thinned to 2 mm around the cutout so the switch clips catch
SCREW_PILOT, SCREW_CLEAR, SCREW_HEAD = 3.4, 4.5, 8.6   # M4 self-tapping into the base pillars
PILLARS = [(sx*(L/2-W-4), sy*(D/2-W-4)) for sx in (-1, 1) for sy in (-1, 1)] + [(0, -(D/2-W-4)), (0, D/2-W-4)]
FEET_X = (-88.0, 88.0)            # mounting ears on both long sides, 5.5 mm holes
BRACKET_X, BRACKET_W, BRACKET_L = 5.0, 90.0, 60.0    # pump bracket: grommet bolts 90 mm across (Y) x 60 mm along the motor (X);
                                                    # same distance from the BACK wall as in the 210 box - the 20 mm went to the front
BRACKET_HOLES = [(BRACKET_X+sx*BRACKET_L/2, sy*BRACKET_W/2) for sx in (-1, 1) for sy in (-1, 1)]
SEAT_H, SEAT_CUP, GROMMET_OD = 8.0, 2.5, 16.0       # seat height above floor, cup depth, rubber grommet OD (cup = OD + 0.8)
NUT_AF, NUT_DEPTH = 8.4, 4.5                        # M5 hex nut pocket from below
FOOT_PIN, FOOT_PIN_L = 10.0, 8.0       # TPU feet: pin d10 (+0.5 interference) x 8 deep into the corner pillars   # 8 mm wide: M5 + washer, +-1.5 mm lateral play, any hole pitch along X
SEG = 64
HEB_FONT = FontProperties(fname='/usr/share/fonts/truetype/freefont/FreeSansBold.ttf')
LOGO_FONT = FontProperties(fname='/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf')

def rrect(l, d, r):
    r = max(r, 0.5)
    return CrossSection.square([l-2*r, d-2*r], center=True).offset(r, JoinType.Round, circular_segments=SEG)

def prism(l, d, r, z0, z1):
    return rrect(l, d, r).extrude(z1-z0).translate([0, 0, z0])

def slab_hull(*layers):           # hull of thin rounded rectangles: (l, d, r, z)
    return Manifold.batch_hull([prism(l, d, r, z, z+0.01) for l, d, r, z in layers])

def cyl(r, z0, z1, x=0, y=0):
    return Manifold.cylinder(z1-z0, r, r, SEG).translate([x, y, z0])

def slot2d(length, width):        # stadium along local x, centred
    c = CrossSection.circle(width/2, 32)
    return CrossSection.batch_hull([c.translate([-length/2+width/2, 0]), c.translate([length/2-width/2, 0])])

def text2d(s, size, font):
    tp = TextPath((0, 0), s, size=size, prop=font)
    cs = CrossSection([p for p in tp.to_polygons(closed_only=True) if len(p) > 2], FillRule.EvenOdd)
    (x0, y0), (x1, y1) = cs.bounds()[:2], cs.bounds()[2:]
    return cs.translate([-(x0+x1)/2, -(y0+y1)/2])

# local (u,v,n) -> world, for features cut into a vertical wall
TO_FRONT = np.array([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0]], float)   # u->+Y, v->+Z, n->+X
TO_BACK  = np.array([[0, 0, -1, 0], [-1, 0, 0, 0], [0, 1, 0, 0]], float)
TO_RIGHT = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0]], float)  # -Y wall: u->+X, v->+Z, n->-Y
TO_LEFT  = np.array([[-1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0]], float) # +Y wall: u->-X, v->+Z, n->+Y

def wall_cut(cs, depth, mat, n0):  # extrude a 2D shape `depth` along the wall normal starting at n0
    return cs.extrude(depth).translate([0, 0, n0]).transform(mat)

def vent_group(u0, u1, v0, v1, pitch=9.0, w=4.0):
    n = int((u1-u0)//pitch)+1; off = (u0+u1)/2 - (n-1)*pitch/2
    return CrossSection.compose([slot2d(v1-v0, w).rotate(90).translate([off+i*pitch, (v0+v1)/2]) for i in range(n)])

# ------------------------------------------------------------------ BASE
def make_base():
    body = prism(L, D, R, 0, HB)
    for fx in FEET_X:                 # mounting ears with a 45deg gusset
        for sy in (-1, 1):
            ear = CrossSection.batch_hull([CrossSection.square([26, 1], center=True).translate([0, 0]),
                                           CrossSection.circle(13, SEG).translate([0, 11])]).extrude(6)
            gus = Manifold.batch_hull([Manifold.cube([3, 0.01, 18]).translate([-1.5, 0, 0]),
                                       Manifold.cube([3, 14, 0.01]).translate([-1.5, 0, 6])])
            for gx in (-9, 9): ear += gus.translate([gx, 0, 0])
            ear -= cyl(2.75, -1, 30, 0, 11)
            ear = ear.translate([fx, D/2-1, 0])
            body += ear if sy > 0 else ear.mirror([0, 1, 0])
    body -= prism(L-2*W, D-2*W, R-W, W, HB+1)
    for x, y in PILLARS:              # screw pillars fused into the walls
        p = cyl(6, W-0.1, HB, x, y) + Manifold.cube([12, 12, HB-W]).translate([x-6+np.sign(x)*4*(x != 0), y-6+np.sign(y)*4, W-0.1])
        body += p ^ prism(L-0.2, D-0.2, R, 0, HB)
        body -= cyl(SCREW_PILOT/2, HB-26, HB+1, x, y)
    # front: gland holes + engraved labels + recessed label panel
    cuts = []
    for y, dia, label in GLANDS:
        cuts.append(cyl(dia/2, -1, 20).transform(np.array([[0, 0, 1, L/2-10], [0, 1, 0, y], [-1, 0, 0, GLAND_Z]], float)))
        cuts.append(wall_cut(text2d(label, 7.5, HEB_FONT).translate([y, GLAND_Z+26]), 3, TO_FRONT, L/2-1.8))
    sy, sw, sh, slabel = SWITCH                                                               # rocker switch cutout
    cuts.append(wall_cut(CrossSection.square([sw, sh], center=True).translate([sy, GLAND_Z]), W+2, TO_FRONT, L/2-W-1))
    cuts.append(wall_cut(rrect(sw+8, sh+8, 2).translate([sy, GLAND_Z]), W-0.8-SWITCH_PANEL+1, TO_FRONT, L/2-W-1))  # thin to 2 mm inside
    cuts.append(wall_cut(text2d(slabel, 7.5, HEB_FONT).translate([sy, GLAND_Z+26]), 3, TO_FRONT, L/2-1.8))
    cuts.append(wall_cut(rrect(150, 62, 4).translate([0, GLAND_Z+6]), 2, TO_FRONT, L/2-0.8))   # 0.8 mm panel recess
    # vents: two groups on each long side, one on the back, each in a 1 mm recessed frame
    for u0, u1 in ((-98, -24), (14, 80)):
        for m, k in ((TO_RIGHT, 1), (TO_LEFT, -1)):      # u is mirrored on the +Y wall
            a, b = sorted((k*u0, k*u1))
            cuts.append(wall_cut(vent_group(a, b, 18, 60), W+2, m, D/2-W-1))
            cuts.append(wall_cut(rrect(b-a+12, 54, 3).translate([(a+b)/2, 39]), 2, m, D/2-1))
    cuts.append(wall_cut(vent_group(-42, 42, 18, 60), W+2, TO_BACK, L/2-W-1))
    cuts.append(wall_cut(rrect(96, 54, 3).translate([0, 39]), 2, TO_BACK, L/2-1))
    # floor: 4 seats the bracket's rubber grommets drop into (90 x 60 hole pattern), M5 bolt + nut trapped underneath
    for x, y in BRACKET_HOLES:
        body += Manifold.batch_hull([cyl(16, W-0.1, W+2, x, y), cyl(13, W+2, W+SEAT_H, x, y)])
        cuts.append(cyl(GROMMET_OD/2+0.4, W+SEAT_H-SEAT_CUP, W+SEAT_H+1, x, y))      # cup the grommet sits in
        cuts.append(cyl(2.75, -1, W+SEAT_H+1, x, y))                                    # M5 clearance
        cuts.append(CrossSection.circle(NUT_AF/np.sqrt(3), 6).extrude(NUT_DEPTH+1).translate([x, y, -1]))  # M5 nut trap
    # underside: blind pockets in the corner pillars for the press-in TPU feet
    for x, y in PILLARS[:4]:
        cuts.append(cyl(FOOT_PIN/2, -1, FOOT_PIN_L+0.5, x, y))
    return body - sum(cuts[1:], cuts[0])

# ------------------------------------------------------------------ FEET (print in TPU 95A)
FOOT_H = 8.0                      # all feet: 8 mm of TPU between box and table
EAR_HOLES = [(fx, sy*(D/2+10)) for fx in FEET_X for sy in (-1, 1)]

def grip_rings(r_out):            # concentric 1 mm grooves underneath: anti-slip, softer contact
    rings = [cyl(r, -1, 1.0) - cyl(r-1.2, -2, 2) for r in np.arange(r_out-2.5, 3, -3.0)]
    return sum(rings[1:], rings[0])

def make_foot():                  # corner foot: press-fit pin into the base pillar, 18 mm pad
    return cyl(9, 0, FOOT_H) + cyl(FOOT_PIN/2+0.25, FOOT_H-0.1, FOOT_H+FOOT_PIN_L) - grip_rings(9)

def make_ear_mount():             # damper under each mounting ear: 30 mm TPU pad + snap pin through the 5.5 mm hole
    pad = Manifold.batch_hull([cyl(15, 0, FOOT_H-1.5), cyl(13.5, FOOT_H-1.5, FOOT_H)])
    pin = cyl(2.6, FOOT_H-0.1, FOOT_H+6.2)                                    # 6 mm ear
    lip = Manifold.batch_hull([cyl(2.6, FOOT_H+6.2, FOOT_H+6.3), cyl(3.2, FOOT_H+6.8, FOOT_H+7.0),
                               cyl(2.2, FOOT_H+8.2, FOOT_H+8.3)])            # snaps over the ear's top face
    slit = Manifold.cube([1.2, 8, 4.5]).translate([-0.6, -4, FOOT_H+4])       # lets the lip squeeze through
    return pad + pin + lip - slit - grip_rings(15)

SCREW_D = 4.0                     # wood screw / M4 through ear + dampers into the surface
def make_ear_pad():               # screw-down isolator under each ear: ear sits in a 1.5 mm pocket (open toward the box)
    pad = Manifold.batch_hull([cyl(15, 0, FOOT_H), cyl(13.5, FOOT_H, FOOT_H+1.5)])
    pocket = CrossSection.batch_hull([CrossSection.square([26.6, 10], center=True).translate([0, -16]),
                                      CrossSection.circle(13.3, SEG)]).extrude(3).translate([0, 0, FOOT_H])
    return pad - pocket - cyl(SCREW_D/2+0.3, -1, FOOT_H+3) - grip_rings(15)

def make_ear_washer():            # TPU washer on top of the ear: screw head never touches the box
    return cyl(7, 0, 3) - cyl(SCREW_D/2+0.2, -1, 4)            # 14 mm: clears the ear gussets

MAT_BASE, MAT_RIM, MAT_WALL = 3.0, 6.0, 4.0   # TPU tray: floor under the box, rim height above it, rim width
def box_footprint():              # base outline incl. the 4 mounting ears (2D)
    fp = rrect(L, D, R)
    for fx in FEET_X:
        ear = CrossSection.batch_hull([CrossSection.square([26, 1], center=True), CrossSection.circle(13, SEG).translate([0, 11])])
        fp += ear.translate([fx, D/2-1]) + ear.translate([fx, D/2-1]).mirror([0, 1])
    return fp

ABS_H = 15.0                      # rigid ABS feet: lift the box 15 mm
def make_foot_abs():              # corner foot: d10 pin (light press) into the base pillar pocket
    f = Manifold.batch_hull([cyl(10, 0, ABS_H-2), cyl(9, ABS_H-0.01, ABS_H)])
    f += cyl(FOOT_PIN/2+0.05, ABS_H-0.1, ABS_H+FOOT_PIN_L-0.5)
    return f - cyl(7.2, -1, 0.8)                                               # 0.8 mm recess for a 14 mm stick-on rubber bumper

def make_ear_foot_abs():          # under each mounting ear: split pin with a small 0.25 mm snap lip (ABS-friendly)
    f = Manifold.batch_hull([cyl(15, 0, ABS_H-2), cyl(13.5, ABS_H-0.01, ABS_H)])
    f += cyl(2.6, ABS_H-0.1, ABS_H+6.2)
    f += Manifold.batch_hull([cyl(2.6, ABS_H+6.2, ABS_H+6.3), cyl(2.95, ABS_H+6.6, ABS_H+6.8), cyl(2.2, ABS_H+8.0, ABS_H+8.1)])
    f -= Manifold.cube([1.4, 8, 6.5]).translate([-0.7, -4, ABS_H+2])           # slit so the pin halves flex
    return f - cyl(10.2, -1, 0.8)                                              # 0.8 mm recess for a 20 mm stick-on rubber bumper

def make_tray():                  # TPU mat the whole box drops into; grooved underside grips the counter
    fp = box_footprint()
    tray = fp.offset(0.6+MAT_WALL, JoinType.Round, circular_segments=SEG).extrude(MAT_BASE+MAT_RIM)
    tray -= fp.offset(0.6, JoinType.Round, circular_segments=SEG).extrude(MAT_RIM+1).translate([0, 0, MAT_BASE])
    for x, y in EAR_HOLES:        # optional: screw straight through ear + tray
        tray -= cyl(SCREW_D/2+0.3, -1, MAT_BASE+1, x, y)
    (x0, y0), (x1, y1) = tray.bounding_box()[:2], tray.bounding_box()[3:5]
    grooves = [Manifold.cube([x1-x0+2, 1.2, 1.0]).translate([x0-1, y, -0.5]) for y in np.arange(y0+4, y1-3, 6)]
    return tray - sum(grooves[1:], grooves[0])

# ------------------------------------------------------------------ LID (modelled in place, z = HB..H)
TOP = H                           # flat roof (prints face-down, whole roof on the bed)
def make_lid():
    outer = Manifold.batch_hull([prism(L, D, R, HB, TOP-2), prism(L-4, D-4, R-2, TOP-2, TOP)])   # 2 mm chamfered top edge
    lid = outer - prism(L-2*W, D-2*W, R-W, HB-1, TOP-W)
    for x, y in PILLARS:              # screw bosses hanging from the roof
        boss = cyl(6, HB, TOP, x, y) + Manifold.cube([12, 12, TOP-HB]).translate([x-6+np.sign(x)*4*(x != 0), y-6+np.sign(y)*4, HB])
        lid += boss ^ outer
        lid -= cyl(SCREW_CLEAR/2, HB-1, H+1, x, y) + cyl(SCREW_HEAD/2, HB+8, H+1, x, y)
    # alignment tongue that drops 5 mm into the base (0.3 mm clearance), notched around the pillars
    tongue = prism(L-2*W-0.6, D-2*W-0.6, R-W, HB-5, HB+0.5) - prism(L-2*W-4.6, D-2*W-4.6, R-W-2, HB-6, HB+1)
    for x, y in PILLARS:
        tongue -= cyl(6.6, HB-6, HB+1, x, y) + Manifold.cube([13.2, 13.2, 7]).translate([x-6.6+np.sign(x)*4*(x != 0), y-6.6+np.sign(y)*4, HB-6])
    lid += tongue
    cuts = [text2d('ANX3D', 26, LOGO_FONT).extrude(3).translate([0, 0, H-1.2]),            # engraved logo
            (rrect(L-54, D-44, 8) - rrect(L-57, D-47, 6.5)).extrude(2).translate([0, 0, H-0.6])]   # 0.6 mm panel outline
    for sx in (-1, 1):                                                                     # roof vents at both ends
        for x in (L/2-22, L/2-15):
            cuts.append(slot2d(80, 4.5).rotate(90).translate([sx*x, 0]).extrude(10).translate([0, 0, TOP-8]))
    for m, k in ((TO_RIGHT, 1), (TO_LEFT, -1)):                                            # side vents on the lid wall
        for u0, u1 in ((-96, -14), (14, 96)):
            cuts.append(wall_cut(vent_group(u0, u1, HB+6, TOP-7), W+2, m, D/2-W-1))
    lid -= sum(cuts[1:], cuts[0])
    return lid

def export(m, name):
    mesh = m.to_mesh()
    t = trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts), process=False)
    t.export(name)
    print(f'{name}: {len(t.faces)} tris, watertight={t.is_watertight}, bounds={np.round(t.bounds, 1).tolist()}')
    return t

if __name__ == '__main__':
    base, lid = make_base(), make_lid()
    export(base, 'base.stl')
    export(lid.rotate([180, 0, 0]).translate([0, 0, H]), 'lid.stl')   # flipped: logo face on the bed
    export(make_foot(), 'foot_TPU_x4.stl')
    export(make_ear_mount(), 'ear_damper_TPU_x4.stl')
    export(make_ear_pad(), 'ear_pad_screw_TPU_x4.stl')
    export(make_ear_washer(), 'ear_washer_TPU_x4.stl')
    export(make_tray(), 'base_mat_TPU.stl')
    plate = [make_ear_foot_abs().translate([-51+i*34, 19, 0]) for i in range(4)] + [make_foot_abs().translate([-51+i*34, -17, 0]) for i in range(4)]
    export(sum(plate[1:], plate[0]), 'feet_plate_ABS_15mm.stl')
