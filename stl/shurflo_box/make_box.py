"""ANX3D enclosure for a Shurflo diaphragm pump 8095-901-890 (230 VAC, ~190 x 96 x 89 mm on its flat bracket).
Outer body 210 x 170 x 120 mm (widened from 140 so the pump fits with a PL 3/8" push-in elbow on each port): base (82 mm) + lid (38 mm), joined by 6 x M4 screws.
Front face: inlet + outlet (17 mm holes for PM8 bulkhead unions) | power gland (M16), Hebrew labels engraved above.
Run:  python3 make_box.py   ->  base.stl, lid.stl (lid already flipped for printing)."""
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection, FillRule, JoinType
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties

L, D, H = 210.0, 170.0, 120.0     # outer body (feet extend beyond D)
HB = 82.0                         # base height (lid = H - HB)
W = 4.0                           # wall / floor thickness
R = 10.0                          # outer corner radius
GLAND_Z = 40.0                    # gland hole centre height
WATER_HOLE = 17.0                 # PM8 push-in bulkhead union (8 mm tube, M16 thread, 17 mm panel hole)
GLANDS = [(-48, WATER_HOLE, 'יציאה'),     # (y, hole dia, label)  - viewed from the front: left -> right
          (0,   16.4, 'חשמל'),             # water holes line up with the elbows on either side of the pump head
          (48,  WATER_HOLE, 'כניסה')]
SCREW_PILOT, SCREW_CLEAR, SCREW_HEAD = 3.4, 4.5, 8.6   # M4 self-tapping into the base pillars
PILLARS = [(sx*(L/2-W-4), sy*(D/2-W-4)) for sx in (-1, 1) for sy in (-1, 1)] + [(0, -(D/2-W-4)), (0, D/2-W-4)]
FEET_X = (-78.0, 78.0)            # mounting ears on both long sides, 5.5 mm holes
PUMP_SLOTS_Y = (-41.5, 41.5)      # floor slots (along X) under the bracket's grommet holes (~83 mm apart)
PUMP_SLOT_W, PUMP_SLOT_L = 8.0, 150.0
MAT_L, MAT_D, MAT_T = 156.0, 112.0, 3.0   # TPU damping mat: 3 mm plate + 2 mm bumps = 5 mm under the bracket
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
    cuts.append(wall_cut(rrect(150, 62, 4).translate([0, GLAND_Z+6]), 2, TO_FRONT, L/2-0.8))   # 0.8 mm panel recess
    # vents: two groups on each long side, one on the back, each in a 1 mm recessed frame
    for u0, u1 in ((-88, -22), (12, 66)):
        for m, k in ((TO_RIGHT, 1), (TO_LEFT, -1)):      # u is mirrored on the +Y wall
            a, b = sorted((k*u0, k*u1))
            cuts.append(wall_cut(vent_group(a, b, 18, 60), W+2, m, D/2-W-1))
            cuts.append(wall_cut(rrect(b-a+12, 54, 3).translate([(a+b)/2, 39]), 2, m, D/2-1))
    cuts.append(wall_cut(vent_group(-42, 42, 18, 60), W+2, TO_BACK, L/2-W-1))
    cuts.append(wall_cut(rrect(96, 54, 3).translate([0, 39]), 2, TO_BACK, L/2-1))
    # floor: pump bolt slots + a 3 mm frame that keeps the TPU damping mat in place
    for y in PUMP_SLOTS_Y:
        cuts.append(slot2d(PUMP_SLOT_L, PUMP_SLOT_W).translate([0, y]).extrude(W+2).translate([0, 0, -1]))
    body += prism(MAT_L+0.8+4, MAT_D+0.8+4, 4, W-0.1, W+3) - prism(MAT_L+0.8, MAT_D+0.8, 2, W-1, W+4)
    # underside: blind pockets in the corner pillars for the press-in TPU feet
    for x, y in PILLARS[:4]:
        cuts.append(cyl(FOOT_PIN/2, -1, FOOT_PIN_L+0.5, x, y))
    return body - sum(cuts[1:], cuts[0])

# ------------------------------------------------------------------ ANTI-VIBRATION (print in TPU 95A)
def make_mat():                   # sits in the floor frame under the pump bracket; bumps face DOWN
    mat = prism(MAT_L, MAT_D, 2, 0, MAT_T)
    for y in PUMP_SLOTS_Y:
        mat -= slot2d(PUMP_SLOT_L, PUMP_SLOT_W).translate([0, y]).extrude(MAT_T+2).translate([0, 0, -1])
    bumps = []
    for x in np.arange(-MAT_L/2+8, MAT_L/2-7, 12):
        for y in np.arange(-MAT_D/2+8, MAT_D/2-7, 12):
            if min(abs(y-sy) for sy in PUMP_SLOTS_Y) > PUMP_SLOT_W/2+4:
                bumps.append(cyl(3, MAT_T-0.1, MAT_T+2, x, y))
    return mat + sum(bumps[1:], bumps[0])   # printed bumps-up, flipped when installed

def make_foot():                  # press-fit pin into the base, 18 mm soft pad underneath
    return cyl(9, 0, 5) + cyl(FOOT_PIN/2+0.25, 4.9, 5+FOOT_PIN_L) - cyl(1.5, -1, 1, 0, 0)

# ------------------------------------------------------------------ LID (modelled in place, z = HB..H)
TOP = H-3.0                       # lid roof; a 3 mm raised logo panel sits on top of it
def make_lid():
    outer = Manifold.batch_hull([prism(L, D, R, HB, TOP-2), prism(L-4, D-4, R-2, TOP-2, TOP)])   # 2 mm chamfered top edge
    lid = outer - prism(L-2*W, D-2*W, R-W, HB-1, TOP-W)
    lid += Manifold.batch_hull([prism(L-54, D-44, 8, TOP-0.1, TOP), prism(L-60, D-50, 5, H-0.01, H)])  # 45deg raised panel
    for x, y in PILLARS:              # screw bosses hanging from the roof
        boss = cyl(6, HB, TOP, x, y) + Manifold.cube([12, 12, TOP-HB]).translate([x-6+np.sign(x)*4*(x != 0), y-6+np.sign(y)*4, HB])
        lid += boss ^ outer
        lid -= cyl(SCREW_CLEAR/2, HB-1, H+1, x, y) + cyl(SCREW_HEAD/2, HB+8, H+1, x, y)
    # alignment tongue that drops 5 mm into the base (0.3 mm clearance), notched around the pillars
    tongue = prism(L-2*W-0.6, D-2*W-0.6, R-W, HB-5, HB+0.5) - prism(L-2*W-4.6, D-2*W-4.6, R-W-2, HB-6, HB+1)
    for x, y in PILLARS:
        tongue -= cyl(6.6, HB-6, HB+1, x, y) + Manifold.cube([13.2, 13.2, 7]).translate([x-6.6+np.sign(x)*4*(x != 0), y-6.6+np.sign(y)*4, HB-6])
    lid += tongue
    cuts = [text2d('ANX3D', 26, LOGO_FONT).extrude(3).translate([0, 0, H-1.2])]            # engraved logo
    for sx in (-1, 1):                                                                     # roof vents at both ends
        for x in (83, 90):
            cuts.append(slot2d(80, 4.5).rotate(90).translate([sx*x, 0]).extrude(10).translate([0, 0, TOP-8]))
    for m, k in ((TO_RIGHT, 1), (TO_LEFT, -1)):                                            # side vents on the lid wall
        for u0, u1 in ((-86, -14), (14, 86)):
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
    export(make_mat(), 'damping_mat_TPU.stl')
    export(make_foot(), 'foot_TPU_x4.stl')
