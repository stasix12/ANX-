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

# ---- כיס לשסתום, שקוע בגוף - העתק מדויק של התעלה בידית הווילונות (נמדד מהקובץ):
#      תעלה 16.0, תקרה עגולה r=8 (לבוסט העגול של השסתום), קודקוד התקרה על דופן הצינור,
#      חורים 4.5: 13.4 ו-29.0 מתחת לקודקוד, 14.0 ביניהם לאורך; שקע 8.0 בעומק 3.0 בדופן אחת. ----
from manifold3d import CrossSection
ch_w, groove_r = 16.0, 8.0
pk_len, u0 = 80.0, 10.0                                     # אורך הגוש, מרחק מסוף הכיפוף
apex = od/2                                                 # קודקוד התקרה = דופן הצינור (19 מציר הצינור), כמו במקור
h1, h2, dz = 13.4, 29.0, 14.0                               # מהקודקוד לחורים, ומרחק החורים לאורך (21.0 באלכסון)
D = apex + h2 + 10.0                                        # תחתית הגוש: 10 מ"מ מתחת למרכז החור הרחוק
hole_d, cb_d, cb_depth = 4.5, 8.0, 3.0
box = lambda x, y, z: Manifold.cube([x, y, z])
R = od/2; ch = D - R                                        # פזה 45° בקצה הפונה לקצה החופשי (למטה בהדפסה)
prof = [(0, u0), (D, u0), (D, u0 + pk_len - ch), (R, u0 + pk_len), (0, u0 + pk_len)]
blk = Manifold.extrude(CrossSection([prof]), od).translate([0, 0, -od/2])   # (x_local, z_local, y_local)
blk = blk.rotate([-90, 0, 0]).mirror([0, 0, 1])                             # -> (x_local, y_local, z_local)
chan = box(100, ch_w, pk_len + 2).translate([apex + groove_r, -ch_w/2, u0 - 1])
chan += Manifold.cylinder(pk_len + 2, groove_r, groove_r, 64).translate([apex + groove_r, 0, u0 - 1])   # תקרה עגולה
pocket = blk - chan
uc = u0 + 38.0
for x, z in ((apex + h1, uc - dz/2), (apex + h2, uc + dz/2)):   # הקרוב לקודקוד - לכיוון הכיפוף; הרחוק - לכיוון הקצה החופשי
    pocket -= Manifold.cylinder(60, hole_d/2, hole_d/2, 32).rotate([-90, 0, 0]).translate([x, -30, z])
    pocket -= Manifold.cylinder(cb_depth + 5, cb_d/2, cb_d/2, 32).rotate([-90, 0, 0]).translate([x, od/2 - cb_depth, z])  # שקע בדופן +y
# --- בדיקה עצמית מול המקור (באותה שיטה: קרניים וחתכים) ---
_me = pocket.to_mesh(); _t = trimesh.Trimesh(np.asarray(_me.vert_properties)[:, :3], np.asarray(_me.tri_verts), process=False)
prof_chk = [round(_t.ray.intersects_location(np.array([[-50.0, yy, uc]]), np.array([[1.0, 0, 0]]))[0][:, 0].max() - apex, 2) for yy in (-7, -4, 0, 4, 7)]
print('CHECK ceiling profile (from apex) at y=-7..7:', prof_chk, ' source: [4.13, 1.07, 0, 1.07, 4.13]')
_w = _t.ray.intersects_location(np.array([[apex + 20.0, -30.0, uc]]), np.array([[0, 1.0, 0]]))[0][:, 1]
print('CHECK channel width:', round(np.sort(_w)[2] - np.sort(_w)[1], 2), ' source: 16.0')
hc = []
for yy in (9.0, 10.0, 11.0):
    sec = _t.section(plane_origin=[0, yy, 0], plane_normal=[0, 1, 0])
    for ent in sec.entities:
        p = sec.vertices[ent.points]
        if len(p) < 8 or not ent.closed: continue
        per = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
        if 10 < per < 20:
            c = p.mean(0); r = np.linalg.norm(p - c, axis=1); hc.append((round(c[0] - apex, 2), round(c[2] - uc, 2), round(2*r.mean(), 2)))
print('CHECK holes (below apex, along, dia):', sorted(set(hc)), ' source: (13.4, -7.0, 4.5) (29.0, +7.0, 4.5)')
cbc = []
for yy in (od/2 - 0.5, od/2 - 2.9):
    sec = _t.section(plane_origin=[0, yy, 0], plane_normal=[0, 1, 0])
    for ent in sec.entities:
        p = sec.vertices[ent.points]
        if len(p) < 8 or not ent.closed: continue
        per = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
        if 20 < per < 30:
            c = p.mean(0); r = np.linalg.norm(p - c, axis=1); cbc.append((round(yy, 1), round(2*r.mean(), 2)))
print('CHECK counterbore dia at depth 0.5 / 2.9:', cbc, ' source: 8.0, depth 3.0')
bend_end = pts[-2]                                          # סוף הקשת = תחילת האחיזה
handle_p = handle_k + place(pocket, bend_end, d)
handle_p -= place(cyl(od - 2*wall, grip_L + 2).translate([0, 0, -1]), bend_end, d)      # מעבר האוויר נשאר פתוח
# ייצוא בכיוון ההדפסה (קצה האחיזה למטה)
hp = handle_p.rotate([0, -angle_deg, 0]).rotate([180, 0, 0]); bb = hp.bounding_box(); hp = hp.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
me = hp.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_pocket_print.stl'); t.export('handle_pocket_print.obj')
bb = hp.bounding_box(); print('handle_pocket', hp.status(), 'height %.0f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], hp.volume()/1000))
probe = place(cyl(24, grip_L - 60).translate([0,0,5]), bend_end, d); print('airway blocked:', round((handle_p ^ probe).volume(), 2))
