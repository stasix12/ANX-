# ידית (זיז חלק + אחיזה + בית 36) עם כיס לשסתום ההתזה מובנה, לפי התעלה בקובץ ANX3D_sofa-tool:
# תעלה 16 מ"מ, דפנות 7, חורים 4.5 עם שקע 8 בדופן אחת, 21 מ"מ באלכסון. הכיס בצד הפנימי של הכיפוף.
import numpy as np, trimesh
from manifold3d import Manifold
exec(open('build_keyed.py').read().split("if __name__")[0])
src = open('build_handle.py').read().split("me = handle.to_mesh()")[0]
src = src.replace("stub_L     = 65.0", "stub_L     = 42.0").replace("grip_L     = 195.0", "grip_L     = 205.0")
exec(src)
# בית 36 בקצה האחיזה
sock_id, sock_od_h, sock_depth = 36.2, 46.0, 50.0
end_p = pts[-1]; d = end_dir
sock = cyl(od, 6, d2=sock_od_h).translate([0,0,-sock_depth-6]) + cyl(sock_od_h, sock_depth).translate([0,0,-sock_depth])
hole = cyl(sock_id, sock_depth+1).translate([0,0,-sock_depth]) + cyl(od-2*wall, (sock_id-(od-2*wall))/2, d2=sock_id).translate([0,0,-sock_depth-(sock_id-(od-2*wall))/2+0.01])
hole += cyl(sock_id+1.5, 1.5, d2=sock_id).translate([0,0,-1.49])
handle_k = handle + place(sock - hole, end_p, d) - place(hole, end_p, d)

# ---- כיס לשסתום, שקוע בגוף. מידות מהקובץ של ידית הווילונות (נמדד):
#      תעלה 16.0; החורים 13.4 ו-29.0 מתחת למשטח שעליו נשען השסתום (קודקוד התקרה במקור = דופן הצינור),
#      14.0 ביניהם לאורך (21.0 באלכסון); קוטר 4.5; שקע 8.0 בעומק 3.0 בדופן אחת.
#      כאן התקרה שטוחה (בהדפסה היא אנכית - אין תלייה), הקצוות מעוגלים, מרווח ביטחון אחרי החור הרחוק. ----
from manifold3d import CrossSection, JoinType
ch_w = 16.0 + 0.4                                           # מרווח ביטחון: 0.2 לכל צד
apex = od/2                                                 # משטח המשענת של השסתום = דופן הצינור (19 מציר הצינור)
h1, h2, dz = 13.4, 29.0, 14.0
hole_d, cb_d, cb_depth = 4.8, 8.6, 3.0              # מרווח ביטחון: חור 4.8 ל-M4, שקע 8.6
margin_end = 14.0                                           # דופן מלאה אחרי קצה החור הרחוק (לפני הפזה/העיגול)
u0 = 8.0                                                    # תחילת הגוש אחרי סוף הכיפוף
uc = u0 + 36.0                                              # מרכז זוג החורים לאורך
D = apex + h2 + 10.0                                        # תחתית הגוש: 10 מ"מ מתחת למרכז החור הרחוק
R = od/2; rr = 6.0                                          # רדיוס עיגול הקצוות
z_far = uc + dz/2 + hole_d/2 + margin_end                   # סוף האזור המלא בעומק החורים
Lp = (z_far - u0) + (D - R)                                 # הפזה 45° מתחילה אחרי אזור הביטחון
box = lambda x, y, z: Manifold.cube([x, y, z])
def rounded(poly, r):
    cs = CrossSection([poly]); return cs.offset(-r, JoinType.Miter).offset(r, JoinType.Round, 1.0, 64)
# הגוש = hull של קטע הצינור ושל "סרגל" מעוגל בתחתית -> הקצוות משתלבים בצינור במשיקיות, בלי מדרגה
bar_x0, zb0 = D - 14.0, u0 + 8.0
Lt = (z_far + (D - R)) - u0                                 # קצה תחתון (לכיוון הקצה החופשי) בשיפוע 45° - ללא תלייה
tube_seg = Manifold.cylinder(Lt, od/2, od/2, F).translate([0, 0, u0])
bar_xy = Manifold.extrude(rounded([(bar_x0, -od/2), (D, -od/2), (D, od/2), (bar_x0, od/2)], rr), z_far - zb0).translate([0, 0, zb0])
bar_xz = Manifold.extrude(rounded([(bar_x0 - 5, zb0), (D, zb0), (D, z_far), (bar_x0 - 5, z_far)], rr), od + 2).translate([0, 0, -od/2 - 1]).rotate([-90, 0, 0]).mirror([0, 0, 1])
bar = bar_xy ^ bar_xz
blk = Manifold.hull(tube_seg + bar) if hasattr(Manifold, 'hull') else (tube_seg + bar).hull()
pocket = blk - box(100, ch_w, Lp + 20).translate([apex, -ch_w/2, u0 - 10])        # התעלה, תקרה שטוחה על דופן הצינור
for x, z in ((apex + h1, uc - dz/2), (apex + h2, uc + dz/2)):   # הקרוב למשענת - לכיוון הכיפוף; הרחוק - לכיוון הקצה החופשי
    pocket -= Manifold.cylinder(60, hole_d/2, hole_d/2, 32).rotate([-90, 0, 0]).translate([x, -30, z])
    pocket -= Manifold.cylinder(cb_depth + 5, cb_d/2, cb_d/2, 32).rotate([-90, 0, 0]).translate([x, od/2 - cb_depth, z])  # שקע בדופן +y
# מדרגה לידית השסתום (הלחץ): חיתוך בפינה התחתונה של הדפנות, מעבר לחור הרחוק לכיוון הקצה החופשי
notch_gap = 3.5                                             # דופן שנשארת מעבר לקצה החור הרחוק
z_n0 = uc + dz/2 + hole_d/2 + notch_gap
x_n0 = apex + h2                                            # מגובה מרכז החור הרחוק ועד התחתית
notch = Manifold.extrude(rounded([(x_n0, z_n0), (D + 10, z_n0), (D + 10, u0 + Lp + 10), (x_n0, u0 + Lp + 10)], 3.0), od + 4).translate([0, 0, -od/2 - 2]).rotate([-90, 0, 0]).mirror([0, 0, 1])
pocket -= notch
# --- בדיקה עצמית מול המקור (קרניים וחתכים) ---
_me = pocket.to_mesh(); _t = trimesh.Trimesh(np.asarray(_me.vert_properties)[:, :3], np.asarray(_me.tri_verts), process=False)
def _hit(o, d, k=0):
    loc = _t.ray.intersects_location(np.array([o]), np.array([d]))[0]; return np.sort(loc[:, {0:0,1:1,2:2}[k]])
prof_chk = [round(_hit([-50.0, yy, uc], [1.0, 0, 0], 0).max() - apex, 2) for yy in (-7, -4, 0, 4, 7)]
print('CHECK ceiling (flat) from the rest surface at y=-7..7:', prof_chk, ' required: all 0')
_w = _hit([apex + 20.0, -30.0, uc], [0, 1.0, 0], 1); print('CHECK channel width:', round(_w[2] - _w[1], 2), ' source: 16.0 (+0.4 clearance)')
hc = set()
for yy in (9.0, 10.5, 12.0):
    sec = _t.section(plane_origin=[0, yy, 0], plane_normal=[0, 1, 0])
    for ent in sec.entities:
        p = sec.vertices[ent.points]
        if len(p) < 8 or not ent.closed: continue
        per = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
        if 10 < per < 20:
            c = p.mean(0); r = np.linalg.norm(p - c, axis=1); hc.add((round(c[0] - apex, 1), round(c[2] - uc, 1), round(2*r.mean(), 2)))
print('CHECK holes (below rest surface, along, dia):', sorted(hc), ' source: (13.4, -7.0, 4.5) (29.0, +7.0, 4.5) -> holes 4.8')
cbc = set()
for yy in (od/2 - 0.5, od/2 - 2.9, od/2 - 3.2):
    sec = _t.section(plane_origin=[0, yy, 0], plane_normal=[0, 1, 0]); ds = []
    for ent in sec.entities:
        p = sec.vertices[ent.points]
        if len(p) < 8 or not ent.closed: continue
        per = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
        if 10 < per < 30:
            c = p.mean(0); r = np.linalg.norm(p - c, axis=1); ds.append(round(2*r.mean(), 1))
    cbc.add((round(od/2 - yy, 1), tuple(sorted(set(ds)))))
print('CHECK counterbore dia at depth 0.5 / 2.9 / 3.2:', sorted(cbc), ' source: 8.0 x 3.0 -> 8.6 x 3.0, then 4.8')
_far = _hit([apex + h2 - 1.5, 12.0, uc], [0, 0, 1.0], 2); print('CHECK wall beyond far hole edge, above the notch (mm):', round(_far[-1] - (uc + dz/2 + hole_d/2), 1), ' required >= 4')
_nt = _hit([apex + h2 + 3.0, 12.0, z_n0 + 5], [-1.0, 0, 0], 0); print('CHECK notch top below rest surface (mm):', round(_nt[-1] - apex, 1), ' required: %.1f' % h2)
bend_end = pts[-2]                                          # סוף הקשת = תחילת האחיזה
handle_p = handle_k + place(pocket, bend_end, d)
handle_p -= place(cyl(od - 2*wall, grip_L + 2).translate([0, 0, -1]), bend_end, d)      # מעבר האוויר נשאר פתוח
# ייצוא בכיוון ההדפסה (קצה האחיזה למטה)
hp = handle_p.rotate([0, -angle_deg, 0]).rotate([180, 0, 0]); bb = hp.bounding_box(); hp = hp.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
me = hp.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_pocket_print.stl'); t.export('handle_pocket_print.obj')
bb = hp.bounding_box(); print('handle_pocket', hp.status(), 'height %.0f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], hp.volume()/1000))
probe = place(cyl(24, grip_L - 60).translate([0,0,5]), bend_end, d); print('airway blocked:', round((handle_p ^ probe).volume(), 2))
