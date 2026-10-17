"""ANX3D styled version of the Santoemma control panel (make_panel.py), rebuilt from the ANX3D reference render.
Functional geometry is kept from make_panel.py: 258 x 175 plate, 2 x 22.2 x 30.2 rocker cutouts with 2 mm at the clips,
44 + 32 mm round holes on the right, 16.4 mm power cable hole middle-left, 6 x M4 holes (4 corners + top/bottom middle).
Layout, logo, vents, rim and grooves are measured off the rectified reference and scaled to 258 x 175 (x 0.963, y 0.888).

Three bodies for a multi-material print, all resting on the black body (no floating parts), back face on the bed:
  black  - plate, switch pockets, recessed logo/vent tray with open slots, logo outline, grooves
  blue   - outer rim, square flange around the 44 hole, ring in the 32 hole, "3D"
  silver - "ANX", switch icons (flush inlays)
Run:  python3 make_anx3d_panel.py  ->  anx3d_panel.step (coloured assembly), anx3d_panel.stl (one body),
                                      anx3d_panel_{black,blue,silver}.stl (multi-material, same origin)."""
import numpy as np, cadquery as cq
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely import affinity

PW, PH = 258.0, 175.0                     # plate (unchanged)
T = 5.0                                   # black plate, front face at z = T
RIM_H = 3.0                               # blue rim stands 3 mm proud of the black face
SWITCH_W, SWITCH_H, SWITCH_PANEL = 22.2, 30.2, 2.0      # rocker cutout + material left at the clips (unchanged)
SWITCHES = [(-57.3, 44.4), (-22.6, 44.4)]
SW_POCKET = (32.5, 40.0, 2.5)             # black pocket each switch sits in (w, h, r)
BIG = (32.5, 44.4, 44.0)                  # 44 hole (x, y, dia) in the blue square flange
FLANGE, FLANGE_R, FLANGE_POCKET = 58.0, 4.0, 63.0
FLANGE_SCREW, FLANGE_PITCH = 3.2, 38.0    # 4 x M3, 38 mm square (measured on the original panel)
SMALL = (90.0, 44.4, 32.0)                # 32 hole (x, y, dia) with the blue ring
RING_OD, RING_BORE = 40.0, 46.0
CABLE = (-100.0, 0.0, 16.4)               # power cable, M16 gland (16 mm thread); flat seat >= 31 mm around it
SCREW, SCREW_HEAD, HEAD_DEPTH = 4.5, 9.0, 1.2
SCREW_X, SCREW_Y = 121.0, 78.25           # measured on the original panel: 8 mm from the sides, 9.25 mm from top/bottom
SCREWS_BLACK = [(sx*SCREW_X, sy*SCREW_Y) for sx in (-1, 1) for sy in (-1, 1)] + [(0, SCREW_Y)]
SCREW_BLUE = (0.0, -SCREW_Y)              # bottom middle screw sits in the blue rim tab
TRAY_Z = T-1.2                            # recessed logo / vent tray floor
LOGO_Z0, LOGO_Z1 = TRAY_Z+2.0, TRAY_Z+3.2 # logo outline plate top, letter top
INLAY = 0.8                               # icon inlay depth
SX, SY, DY = 0.963, 0.888, -1.0           # reference -> plate scale (+ logo shift)

# ------------------------------------------------------------------ 2D outlines
def ref(pts):                             # reference-render mm -> plate mm
    return [(x*SX, y*SY+DY) for x, y in pts]

def plate_outline():                      # left corners R6, right corners 5 mm chamfer (as in the reference)
    w, h, r, c = PW/2, PH/2, 6.0, 5.0
    q = [(w-c, h), (w, h-c), (w, -h+c), (w-c, -h)]
    arc = lambda cx, cy, a0: [(cx+r*np.cos(a), cy+r*np.sin(a)) for a in np.linspace(a0, a0-np.pi/2, 9)]
    return Polygon(q + arc(-w+r, -h+r, 1.5*np.pi) + arc(-w+r, h-r, np.pi))

def rim_inner():                          # black panel outline inside the blue rim (13 mm sides, 6.5 mm top, 9 mm bottom),
    xs, xn, yt, yn, yb = 116.0, 126.0, 81.0, 84.5, -78.5    # notched around the black-zone screw heads,
    return Polygon([(xs, -64), (xn, -73.5), (xn, -84), (115, -84), (109.5, yb), (14, yb), (9, -72.5),   # blue tab around
                    (-9, -72.5), (-14, yb), (-109.5, yb), (-115, -84), (-xn, -84), (-xn, -73.5), (-xs, -64),  # the bottom
                    (-xs, 66), (-xn, 75.5), (-xn, yn), (-116.5, yn), (-113, yt), (-9, yt), (-5.5, yn),        # middle screw
                    (5.5, yn), (9, yt), (113, yt), (116.5, yn), (122, yn), (xn, 81), (xn, 75.5), (xs, 66)])

TRAY = Polygon([(-79, -3.6), (80.9, -3.6), (105.9, -30.2), (105.9, -62.9), (98.8, -70), (-100, -70),
                (-107.9, -62.1), (-107.9, -39.1)])
GROOVE = LineString([(-114.5, 73), (-110, 68.5), (-110, 17.0), (-84, 17.0), (-73.2, 6.2), (-35, 6.2),     # V groove,
                     (-31, 8.9), (78, 8.9), (83, 3.6), (108.5, 3.6), (113, 8)]).buffer(0.3, cap_style='flat', join_style='mitre')  # 2.2 top x 0.8

# vents: 15 open slots, 6 mm wide, 12.8 mm pitch, leaning 15 deg (top to the right)
SLOT_W, SLOT_L, SLOT_N, SLOT_PITCH, SLOT_LEAN, SLOT_X0, SLOT_Y = 6.0, 32.1, 15, 12.8, 15.0, 3.6, -51.5
SLOTS = [(SLOT_X0+(i-(SLOT_N-1)/2)*SLOT_PITCH, SLOT_Y) for i in range(SLOT_N)]

# logo letters, traced from the rectified reference (reference mm, cap height -6.5 .. -33.5)
def rrect_pts(x0, y0, x1, y1, rtr=0, rbr=0, n=10):     # rectangle, rounded top-right / bottom-right corners
    p = [(x0, y0), (x1-rbr, y0)]
    if rbr: p += [(x1-rbr+rbr*np.cos(a), y0+rbr+rbr*np.sin(a)) for a in np.linspace(-np.pi/2, 0, n)]
    p += [(x1, y1-rtr)]
    if rtr: p += [(x1-rtr+rtr*np.cos(a), y1-rtr+rtr*np.sin(a)) for a in np.linspace(0, np.pi/2, n)]
    return p + [(x0, y1)]

YT, YB = -6.5, -33.5
def letters():
    A = Polygon(ref([(-69.5, YB), (-60.5, YT), (-53, YT), (-44.5, YB)])) - \
        Polygon(ref([(-56.6, -15.5), (-60.2, -27), (-50.6, -27)]))
    N = unary_union([Polygon(ref([(-37.5, YB), (-37.5, YT), (-29, YT), (-29, YB)])),
                     Polygon(ref([(-16.5, YB), (-16.5, YT), (-8, YT), (-8, YB)])),
                     Polygon(ref([(-37.5, YT), (-27.5, YT), (-8, YB), (-18, YB)]))])
    X = unary_union([Polygon(ref([(-6, YT), (4, YT), (25, YB), (15, YB)])),
                     Polygon(ref([(14.5, YT), (24.5, YT), (4, YB), (-6, YB)]))])
    s1, s2 = YT-7.6, YT-7.6-1.4                         # "3": top arm, slot, middle arm, slot, bottom arm
    s3, s4 = s2-8.5, s2-8.5-1.4
    three = Polygon(ref(rrect_pts(29.5, YB, 54, YT, 7, 7)))
    three -= Polygon(ref([(29.4, s2), (45.5, s2), (45.5, s1), (29.4, s1)])).buffer(0)
    three -= Polygon(ref([(29.4, s3), (35.5, s3), (35.5, s2), (29.4, s2)]))
    three -= Polygon(ref([(29.4, s4), (46.5, s4), (46.5, s3), (29.4, s3)]))
    D = Polygon(ref(rrect_pts(56.5, YB, 85, YT, 11.5, 11.5))) - Polygon(ref(rrect_pts(64, -26.5, 75.5, -15, 5, 5)))
    return unary_union([A, N, X]), unary_union([three, D])

def icons():                              # icons above the switches (silver inlays): left = water spray, right = vacuum
    (x1, _), (x2, _) = SWITCHES
    y = 75.0
    def drop(cx, cy, w=1.5, h=2.3):       # water droplet, point up
        return unary_union([Point(cx, cy-h/2+w/2).buffer(w/2), Polygon([(cx-w/2, cy-h/2+w/2), (cx+w/2, cy-h/2+w/2), (cx, cy+h/2)])])
    nozzle = unary_union([Polygon([(x1-2.4, y+4.6), (x1+2.4, y+4.6), (x1+2.4, y+3.0), (x1-2.4, y+3.0)]),   # spray nozzle
                          Polygon([(x1-1.1, y+3.1), (x1+1.1, y+3.1), (x1+0.7, y+2.0), (x1-0.7, y+2.0)])])
    drops = [drop(x1+dx, y+yy) for yy, dxs in ((0.0, (-1.6, 0, 1.6)), (-2.9, (-3.6, -1.2, 1.2, 3.6)),
                                                (-5.6, (-5.0, -2.5, 0, 2.5, 5.0)))
             for dx in dxs]
    spray = unary_union([nozzle] + drops)
    t = np.linspace(0, 1, 32)[:, None]                                                 # canister vacuum pictogram:
    q = [np.array(p) for p in ((x2+0.6, y-1.6), (x2-1.6, y-1.2), (x2+0.2, y+5.4), (x2-2.4, y+4.0))]   # S-shaped hose
    hose = LineString((1-t)**3*q[0] + 3*(1-t)**2*t*q[1] + 3*(1-t)*t**2*q[2] + t**3*q[3]).buffer(0.5)
    wand = LineString([(x2-2.4, y+4.0), (x2-4.2, y-3.7)]).buffer(0.6, cap_style='flat')
    grip = LineString([(x2-2.4, y+4.0), (x2-3.6, y+4.6)]).buffer(0.55)
    head = Polygon([(x2-6.4, y-5.0), (x2-2.6, y-5.0), (x2-3.2, y-3.6), (x2-5.8, y-3.6)])
    body = Polygon([(x2+1.6, y-3.4), (x2+4.6, y-3.4), (x2+4.6, y-1.2), (x2+1.6, y-1.2)]).buffer(1.5, join_style='round')
    wheels = [Point(x2+1.7, y-4.9).buffer(0.7), Point(x2+4.5, y-4.9).buffer(0.7)]
    vac = unary_union([hose, wand, grip, head, body] + wheels)
    return unary_union([spray, vac])

# ------------------------------------------------------------------ 2D -> CadQuery solids
def prism(poly, z0, z1):
    polys = getattr(poly, 'geoms', [poly])
    out = None
    for p in polys:
        p = p.simplify(0.01)
        s = cq.Workplane('XY', origin=(0, 0, z0)).polyline(list(p.exterior.coords)[:-1]).close().extrude(z1-z0)
        for ring in p.interiors:
            s = s.cut(cq.Workplane('XY', origin=(0, 0, z0-1)).polyline(list(ring.coords)[:-1]).close().extrude(z1-z0+2))
        out = s if out is None else out.union(s)
    return out

def mitre_offset(pts, d):                 # offset a CCW polygon outwards by d, sharp corners, same vertex count
    p = np.asarray(pts, float); n = len(p)
    e = np.roll(p, -1, 0) - p; e /= np.linalg.norm(e, axis=1)[:, None]
    nrm = np.stack([e[:, 1], -e[:, 0]], 1)                       # outward normal of a CCW edge
    out = []
    for i in range(n):
        n0, n1 = nrm[i-1], nrm[i]
        b = n0 + n1; out.append(p[i] + b/np.linalg.norm(b) * d/np.sqrt((1 + n0 @ n1)/2))
    return [tuple(q) for q in out]

def lofted(poly, z0, z1, d):              # ruled solid from `poly` at z0 to `poly` grown by d at z1 (45 deg if d = z1-z0)
    p = poly.simplify(0.01)
    if not p.exterior.is_ccw: p = Polygon(list(p.exterior.coords)[::-1])
    pts = list(p.exterior.coords)[:-1]
    w0 = cq.Wire.makePolygon([cq.Vector(x, y, z0) for x, y in pts], close=True)
    w1 = cq.Wire.makePolygon([cq.Vector(x, y, z1) for x, y in mitre_offset(pts, d)], close=True)
    return cq.Workplane('XY').add(cq.Solid.makeLoft([w0, w1], True))

def chamfer_cut(poly, z_top, c):          # 45 deg chamfer along the top edge of a cut-out with outline `poly`
    return lofted(poly, z_top-c, z_top+0.01, c+0.01)

def cyl(d, z0, z1, x=0, y=0):
    return cq.Workplane('XY', origin=(x, y, z0)).circle(d/2).extrude(z1-z0)

def cone_cut(d, z_top, c, x, y):          # 45 deg chamfer on a round hole
    return cq.Workplane('XY', origin=(x, y, z_top-c)).circle(d/2).extrude(c+0.01, taper=-45)

def rbox(w, h, r, z0, z1, x=0, y=0):
    return cq.Workplane('XY', origin=(x, y, z0)).rect(w, h).extrude(z1-z0).edges('|Z').fillet(r)

def slot(x, y, z0, z1, grow=0.0):
    return (cq.Workplane('XY', origin=(x, y, z0)).slot2D(SLOT_L+2*grow, SLOT_W+2*grow, 90-SLOT_LEAN).extrude(z1-z0))

# ------------------------------------------------------------------ bodies
SKIRT = 2.5                               # blue wraps the plate edge full height (blue frame sides as in the reference)

def make_black():
    b = prism(plate_outline().buffer(-SKIRT, join_style='mitre'), 0, T)
    cuts = []
    for x, y in SWITCHES:
        cuts += [rbox(*SW_POCKET, SWITCH_PANEL, T+1, x, y),
                 cq.Workplane('XY', origin=(x, y, -1)).rect(SWITCH_W, SWITCH_H).extrude(T+2)]
    bx, by, bd = BIG
    cuts += [rbox(FLANGE_POCKET, FLANGE_POCKET, FLANGE_R+1, T-1.5, T+1, bx, by), cyl(bd, -1, T+1, bx, by)]
    cuts += [cyl(FLANGE_SCREW, -1, T+1, bx+sx*FLANGE_PITCH/2, by+sy*FLANGE_PITCH/2) for sx in (-1, 1) for sy in (-1, 1)]
    sx_, sy_, sd = SMALL
    cuts += [cyl(RING_BORE, T-2, T+1, sx_, sy_), cyl(sd, -1, T+1, sx_, sy_)]
    cx, cy, cd = CABLE
    cuts += [cyl(cd, -1, T+1, cx, cy), cone_cut(cd, T, 0.5, cx, cy)]
    for x, y in SCREWS_BLACK:
        cuts += [cyl(SCREW, -1, T+1, x, y), cyl(SCREW_HEAD, T-HEAD_DEPTH, T+1, x, y)]
    cuts += [cyl(SCREW, -1, T+1, *SCREW_BLUE)]
    cuts += [prism(TRAY, TRAY_Z, T+1), chamfer_cut(TRAY, T, T-TRAY_Z)]           # recessed tray, 45 deg wall
    for x, y in SLOTS:                                                            # open vents, 0.8 mm top chamfer
        cuts += [slot(x, y, -1, T+1),
                 cq.Workplane('XY', origin=(x, y, TRAY_Z-0.8)).slot2D(SLOT_L, SLOT_W, 90-SLOT_LEAN).extrude(0.81, taper=-45)]
    cuts += [chamfer_cut(GROOVE, T, 0.8), prism(GROOVE, T-0.8, T+1), prism(icons(), T-INLAY, T+1)]
    for c in cuts:
        b = b.cut(c)
    silver, blue = letters()
    grown = unary_union([silver, blue]).buffer(1.8, join_style='mitre', mitre_limit=2.5)
    outline = unary_union([Polygon(g.exterior) for g in getattr(grown, 'geoms', [grown])])
    return b.union(prism(outline, TRAY_Z-0.01, LOGO_Z0))                          # raised black outline under the logo

def make_blue():
    inner = rim_inner()
    outer = plate_outline().simplify(0.01)
    top = lofted(outer, T+RIM_H-1.0, T+RIM_H, -1.0)
    rim = prism(outer, T, T+RIM_H-1.0).union(top)                                    # 1 mm chamfer on the outer top edge
    rim = rim.union(prism(outer, 0, T).cut(prism(outer.buffer(-SKIRT, join_style='mitre'), -1, T+1)))   # edge skirt
    rim = rim.cut(prism(inner, T-1, T+RIM_H+1)).cut(chamfer_cut(inner, T+RIM_H, 1.5))   # 1.5 mm bevel on the inner edge
    rim = rim.cut(cyl(SCREW, T-1, T+RIM_H+1, *SCREW_BLUE)).cut(cyl(SCREW_HEAD, T+RIM_H-HEAD_DEPTH, T+RIM_H+1, *SCREW_BLUE))
    bx, by, bd = BIG
    fl = rbox(FLANGE, FLANGE, FLANGE_R, T-1.5, T+1.5, bx, by).cut(cyl(bd, T-2, T+2, bx, by)).cut(cone_cut(bd, T+1.5, 1.5, bx, by))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = bx+sx*FLANGE_PITCH/2, by+sy*FLANGE_PITCH/2
            fl = fl.cut(cyl(FLANGE_SCREW, T-2, T+2, x, y)).cut(cyl(6.0, T+1.5-1.2, T+2, x, y))
    sx_, sy_, sd = SMALL
    ring = cyl(RING_OD, T-2, T, sx_, sy_).cut(cyl(sd, T-3, T+1, sx_, sy_)).cut(cone_cut(sd, T, 0.8, sx_, sy_))
    _, three_d = letters()
    return rim.union(fl).union(ring).union(prism(three_d, LOGO_Z0, LOGO_Z1))

def make_silver():
    anx, _ = letters()
    return prism(anx, LOGO_Z0, LOGO_Z1).union(prism(icons(), T-INLAY, T))

COLORS = {'black': (0.06, 0.06, 0.07), 'blue': (0.05, 0.28, 1.0), 'silver': (0.78, 0.79, 0.80)}

def build():
    return {'black': make_black(), 'blue': make_blue(), 'silver': make_silver()}

if __name__ == '__main__':
    parts = build()
    asm = cq.Assembly(name='anx3d_panel')
    for k, s in parts.items():
        asm.add(s, name=k, color=cq.Color(*COLORS[k]))
        cq.exporters.export(s, f'anx3d_panel_{k}.stl', tolerance=0.02, angularTolerance=0.1)
    asm.save('anx3d_panel.step')
    one = parts['black'].union(parts['blue']).union(parts['silver'])
    cq.exporters.export(one, 'anx3d_panel.stl', tolerance=0.02, angularTolerance=0.1)
    import trimesh                                                   # report from the exported meshes (tight bounds)
    for k in ['black', 'blue', 'silver', None]:
        m = trimesh.load(f'anx3d_panel_{k}.stl' if k else 'anx3d_panel.stl')
        print(f'{k or "combined":9s} watertight={m.is_watertight} bodies={len(m.split(only_watertight=False))} '
              f'vol={m.volume/1000:.1f}cm3 bounds={m.bounds.round(2).tolist()}')
