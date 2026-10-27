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

# ---- כיס לשסתום (קואורדינטות מקומיות: z לאורך האחיזה לכיוון הקצה החופשי, +x פנימה לכיפוף = "למטה", y רוחב) ----
ch_w, wall_t, pk_len, u0 = 16.0, 7.0, 60.0, 10.0          # רוחב תעלה, עובי דופן, אורך הכיס, מרחק מסוף הכיפוף
pk_depth = od/2 + 38.0                                      # תחתית הדפנות: 38 מ"מ מתחת לדופן הצינור
h1, h2 = 13.4, 13.4 + 21.0/np.sqrt(2)                       # חורים: מתחת לדופן הצינור (כמו בקובץ המקור: 13.4 / 28.3)
hole_d, cb_d, cb_depth = 4.5, 8.0, 2.5
dz = 21.0/np.sqrt(2)
box = lambda x, y, z: Manifold.cube([x, y, z])
pocket = None
for sgn in (-1, 1):
    w = box(pk_depth, wall_t, pk_len).translate([0, sgn*ch_w/2 if sgn > 0 else -(ch_w/2 + wall_t), u0])
    pocket = w if pocket is None else pocket + w
pocket -= box(100, ch_w, pk_len + 2).translate([od/2 + 0.15, -ch_w/2, u0 - 1])        # התעלה פתוחה עד הצינור
uc = u0 + pk_len/2
for x, z in ((od/2 + h1, uc - dz/2), (od/2 + h2, uc + dz/2)):   # החור הקרוב לצינור - לכיוון הכיפוף, הרחוק - לכיוון הקצה (כמו במקור)
    pocket -= Manifold.cylinder(60, hole_d/2, hole_d/2, 32).rotate([-90, 0, 0]).translate([x, -30, z])
    pocket -= Manifold.cylinder(cb_depth + 5, cb_d/2, cb_d/2, 32).rotate([-90, 0, 0]).translate([x, ch_w/2 + wall_t - cb_depth, z])  # שקע בדופן +y
bend_end = pts[-2]                                          # סוף הקשת = תחילת האחיזה
handle_p = handle_k + place(pocket, bend_end, d)
handle_p -= place(cyl(od - 2*wall, grip_L + 2).translate([0, 0, -1]), bend_end, d)      # מעבר האוויר נשאר פתוח
# ייצוא בכיוון ההדפסה (קצה האחיזה למטה)
hp = handle_p.rotate([0, -angle_deg, 0]).rotate([180, 0, 0]); bb = hp.bounding_box(); hp = hp.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
me = hp.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_pocket_print.stl'); t.export('handle_pocket_print.obj')
bb = hp.bounding_box(); print('handle_pocket', hp.status(), 'height %.0f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], hp.volume()/1000))
probe = place(cyl(24, grip_L - 60).translate([0,0,5]), bend_end, d); print('airway blocked:', round((handle_p ^ probe).volume(), 2))
