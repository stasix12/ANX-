# ידית עם כיס לשסתום שיושב על הקשת עצמה. כל מידות הכיס (תעלה, ברגים, חיתוכים) זהות ל-build_handle_pocket.py,
# רק שהמסגרת המקומית של הכיס ממוקמת על אמצע הקשת (משיק לקשת), והגוש הוא hull של הצינור המעוקל + הסרגל.
import numpy as np, trimesh, io, contextlib
from manifold3d import Manifold, CrossSection, JoinType
exec(open('build_keyed.py').read().split("if __name__")[0])
src = open('build_handle.py').read().split("me = handle.to_mesh()")[0]
src = src.replace("stub_L     = 65.0", "stub_L     = 42.0").replace("grip_L     = 195.0", "grip_L     = 205.0")
exec(src)
sock_id, sock_od_h, sock_depth = 36.2, 46.0, 50.0
end_p = pts[-1]; d = end_dir
sock = cyl(od, 6, d2=sock_od_h).translate([0,0,-sock_depth-6]) + cyl(sock_od_h, sock_depth).translate([0,0,-sock_depth])
hole = cyl(sock_id, sock_depth+1).translate([0,0,-sock_depth]) + cyl(od-2*wall, (sock_id-(od-2*wall))/2, d2=sock_id).translate([0,0,-sock_depth-(sock_id-(od-2*wall))/2+0.01])
hole += cyl(sock_id+1.5, 1.5, d2=sock_id).translate([0,0,-1.49])
handle_k = handle + place(sock - hole, end_p, d) - place(hole, end_p, d)

# ---- מסגרת הכיס: משיק לאמצע הקשת ----
a = np.radians(angle_deg); c = np.array([bend_R, 0, stub_L])
phi = POCKET_ARC_FRACTION if 'POCKET_ARC_FRACTION' in dir() else 0.5      # 0 = תחילת הקשת, 1 = סופה
p_mid = c + bend_R*np.array([-np.cos(a*phi), 0, np.sin(a*phi)])
t_mid = np.array([np.sin(a*phi), 0, np.cos(a*phi)])
P = lambda m: place(m, p_mid, t_mid)

# ---- מידות הכיס (זהות) ----
ch_w = 16.4; apex = od/2; h1, h2, dz = 13.4, 29.0, 14.0
hole_d, cb_d, cb_depth = 4.8, 8.6, 3.0
uc = 0.0                                                    # הברגים ממורכזים על אמצע הקשת
u0 = uc - 36.0; D = apex + h2 + 10.0; R = od/2; rr = 6.0
margin_end = 14.0; z_far = uc + dz/2 + hole_d/2 + margin_end; Lp = (z_far - u0) + (D - R)
box = lambda x, y, z: Manifold.cube([x, y, z])
def rounded(poly, r):
    cs = CrossSection([poly]); return cs.offset(-r, JoinType.Miter).offset(r, JoinType.Round, 1.0, 64)
def xz(poly, r=None):
    cs = rounded(poly, r) if r else CrossSection([poly])
    return Manifold.extrude(cs, od + 4).translate([0, 0, -od/2 - 2]).rotate([-90, 0, 0]).mirror([0, 0, 1])
# הגוש: hull של קטע הצינור המעוקל (מתוך הידית) ושל הסרגל המעוגל
bar_x0, zb0 = D - 14.0, u0 + 8.0
bar = Manifold.extrude(rounded([(bar_x0, -od/2), (D, -od/2), (D, od/2), (bar_x0, od/2)], rr), z_far - zb0).translate([0, 0, zb0]) ^ xz([(bar_x0 - 5, zb0), (D, zb0), (D, z_far), (bar_x0 - 5, z_far)], rr)
slab = P(box(200, 200, Lp).translate([-100, -100, u0]))
tube_piece = handle_k ^ slab
blk = Manifold.hull(tube_piece + P(bar))
# חיתוכים (בקואורדינטות מקומיות, ממוקמים עם P)
cut = box(100, ch_w, Lp + 20).translate([apex, -ch_w/2, u0 - 10])                          # התעלה
for x, z in ((apex + h1, uc - dz/2), (apex + h2, uc + dz/2)):                              # ברגים: רדוד לכיוון הזיז, עמוק לכיוון האחיזה
    cut += Manifold.cylinder(60, hole_d/2, hole_d/2, 32).rotate([-90, 0, 0]).translate([x, -30, z])
    cut += Manifold.cylinder(cb_depth + 5, cb_d/2, cb_d/2, 32).rotate([-90, 0, 0]).translate([x, od/2 - cb_depth, z])
cut += xz([(apex + h2 + cb_d/2 + 1.7, u0 - 20), (D + 10, u0 - 20), (D + 10, uc + dz/2 + 14.0), (apex + h2 + cb_d/2 + 1.7, uc + dz/2 + 14.0)], 3.0)   # 35 מתחת לבורג העמוק
cut += xz([(apex + 30.5, u0 - 10), (D + 10, u0 - 10), (D + 10, uc), (apex + 30.5, uc)], 3.0)                                          # 30.5 מאמצע הברגים לכיוון הזיז
Ld = 18.0
cut += xz([(apex - 0.5, u0 - 40), (D + 10, u0 - 40), (D + 10, u0 + Ld * (D + 10.5 - apex) / (D - apex)), (apex - 0.5, u0)])        # אלכסון
holes_only = Manifold.compose([]) if False else None
for x, z in ((apex + h1, uc - dz/2), (apex + h2, uc + dz/2)):
    hcyl = Manifold.cylinder(60, hole_d/2, hole_d/2, 32).rotate([-90, 0, 0]).translate([x, -30, z]) + Manifold.cylinder(cb_depth + 5, cb_d/2, cb_d/2, 32).rotate([-90, 0, 0]).translate([x, od/2 - cb_depth, z])
    holes_only = hcyl if holes_only is None else holes_only + hcyl
handle_p = handle_k + (blk - P(cut))                                       # התעלה, האלכסון והחיתוכים - בגוש בלבד; הצינור המעוקל נשאר שלם
handle_p -= P(box(100, ch_w, 36).translate([apex, -ch_w/2, uc - 18]))      # תקרה שטוחה רק היכן שגוש הפליז יושב (+-18 סביב הברגים)
handle_p -= P(holes_only)                                                  # הברגים
handle_p -= inner                                                          # ה-hull ממלא את הצינור - פותחים מחדש את מעבר האוויר

# ---- בדיקות ----
me = handle_p.to_mesh(); _t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
def hit(o_local, d_local):
    o = p_mid + o_local[0]*np.array([np.cos(a*phi), 0, -np.sin(a*phi)]) + o_local[1]*np.array([0,1,0]) + o_local[2]*t_mid
    dd = d_local[0]*np.array([np.cos(a*phi), 0, -np.sin(a*phi)]) + d_local[1]*np.array([0,1,0]) + d_local[2]*t_mid
    loc = _t.ray.intersects_location(np.array([o]), np.array([dd]))[0]
    return np.sort((loc - o) @ dd) if len(loc) else np.array([])
print('CHECK rest surface flat over +-17 (depth from apex):', [round(hit([apex - 4, 0, z], [1, 0, 0])[0] - 4, 2) for z in (-17, -9, 0, 9, 17)], ' required: 0')
print('CHECK channel width:', round(np.diff(hit([apex + 20, -30, uc], [0, 1, 0])[1:3])[0], 2), ' required: 16.4')
hc = set()
for yy in (9.0, 10.5, 12.0):
    o = p_mid + yy*np.array([0,1,0]); sec = _t.section(plane_origin=o, plane_normal=[0,1,0])
    for ent in sec.entities:
        p = sec.vertices[ent.points]
        if len(p) < 8 or not ent.closed: continue
        per = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
        if 10 < per < 20:
            cc = p.mean(0); r = np.linalg.norm(p - cc, axis=1); rel = cc - p_mid
            hc.add((round(rel @ np.array([np.cos(a*phi), 0, -np.sin(a*phi)]) - apex, 1), round(rel @ t_mid - uc, 1), round(2*r.mean(), 2)))
print('CHECK holes (below rest surface, along, dia):', sorted(hc), ' required: (13.4, -7.0) (29.0, +7.0), dia 4.8')
cc_ = np.array([bend_R, 0, stub_L]); worst = 99
for deg in np.linspace(0, angle_deg, 41):
    th = np.radians(deg); p0 = cc_ + bend_R*np.array([-np.cos(th), 0, np.sin(th)]); n = (cc_ - p0) / np.linalg.norm(cc_ - p0)
    loc = _t.ray.intersects_location(np.array([p0]), np.array([n]))[0]
    dists = np.sort(np.linalg.norm(loc - p0, axis=1)); dists = dists[dists > 1.0]
    if len(dists) >= 2: worst = min(worst, dists[1] - dists[0])
print('CHECK min tube wall in the bend, pocket side (mm): %.1f  required >= 3.5' % worst)
probe = place(cyl(24, grip_L - 60).translate([0,0,5]), pts[-2], d) + cyl(24, stub_L - 2).translate([0,0,1])
print('airway blocked:', round((handle_p ^ probe).volume(), 2))
hp = handle_p.rotate([0, -angle_deg, 0]).rotate([180, 0, 0]); bb = hp.bounding_box(); hp = hp.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
me = hp.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_pocket_print.stl'); t.export('handle_pocket_print.obj')
bb = hp.bounding_box(); print('handle_pocket', hp.status(), 'height %.0f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], hp.volume()/1000))
