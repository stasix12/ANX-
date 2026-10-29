# ידית עם בית הברגה מובנה: קצה הזיז הוא חצי גוף של המחבר הדק (הברגה + מושב קוני),
# הקרבון נכנס ישר לידית ונתפס עם הטבעת והאום הרגילים. בלי מתאם, בלי שיניים, בלי דבק.
import numpy as np, trimesh, zipfile, io, contextlib
src = open('build_handle_pocket2.py').read().split("hp = handle_p.rotate")[0]
src = src.replace('replace("stub_L     = 65.0", "stub_L     = 42.0")', 'replace("stub_L     = 65.0", "stub_L     = 50.0")').replace('"grip_L     = 205.0"', '"grip_L     = 198.0"')
with contextlib.redirect_stdout(io.StringIO()): exec(src)
# גוף המחבר בקצה הזיז: הפנים (מושב) ב-z=0, הברגה 0..15, כתף 15..37, מעבר קוני 37..45 ל-38
body_half = half_body().rotate([180, 0, 0]).translate([0, 0, face])            # פתוח, קדח 38.3 עד z=37
cone = cyl(54, 8, d2=od).translate([0, 0, face])
stub_cut = cyl(60, 46).translate([0, 0, -1])                                     # מסיר את הזיז הישן (38) באזור הגוף
handle_i = (handle_p - stub_cut) + body_half + cone
handle_i -= cyl(bore, face + 0.01).translate([0, 0, -0.01])                      # קדח לקרבון עד העצירה
handle_i -= cyl(bore, (bore - stop_d)/2, d2=stop_d).translate([0, 0, face - 0.01])   # עצירה קונית 45° (בלי תמיכות)
handle_i -= cyl(stop_d, 20).translate([0, 0, face - 1])                         # מעבר אוויר 31 עד הצינור (26)
handle_i -= cyl(od - 2*wall, 30).translate([0, 0, face + 2])
# חור אופציונלי לפין נעילה נגד סיבוב: 5.2 מ"מ דרך הכתף והקרבון, בניצב למישור הכיפוף (ציר y)
pin_z = 26.0
handle_i -= Manifold.cylinder(80, 2.6, 2.6, 32).rotate([-90, 0, 0]).translate([0, -40, pin_z])
# עין לצינור המים (9.4) בצד הכיס, מתחת לאום: מיישרת את הצינור מהשסתום אל העין שעל מחבר מוט-מוט,
# ועוקפת את האום (רדיוס 31) עם מרווח. התחתית בשיפוע 45° להדפסה בלי תמיכות.
eye_x, eye_r, eye_w = 39.2, 9.4/2, 2.5
eye_z0, eye_z1 = 16.0, 60.0
eye = Manifold.cylinder(eye_z1 - eye_z0, eye_r + eye_w, eye_r + eye_w, 48).translate([eye_x, 0, eye_z0])
eye += Manifold.cube([eye_x - 17.0, 2*(eye_r + eye_w), eye_z1 - eye_z0]).translate([17.0, -(eye_r + eye_w), eye_z0])
slope = Manifold.extrude(CrossSection([[(10.0, eye_z0 - 1), (60.0, eye_z0 - 1), (60.0, eye_z1 - (60.0 - 25.0)), (10.0, eye_z1 - (10.0 - 25.0))]]), 40).translate([0, 0, -20]).rotate([-90, 0, 0]).mirror([0, 0, 1])
eye = eye ^ slope
eye -= Manifold.cylinder(eye_z1 - eye_z0 + 2, eye_r, eye_r, 48).translate([eye_x, 0, eye_z0 - 1])
eye -= Manifold.cylinder(1.5, eye_r + 1.5, eye_r, 48).translate([eye_x, 0, eye_z0 - 0.01])             # פזה בכניסה
handle_i += eye
handle_i -= cyl(od - 2*wall, 30).translate([0, 0, face + 2])                                           # מעבר האוויר נשאר פתוח
print('CHECK hose eye clears the nut (eye inner wall radius %.1f > nut radius 31):' % (eye_x - eye_r - eye_w), eye_x - eye_r - eye_w > 31)
# שני תופסני C לצינור המים לאורך האחיזה, בצד (90° ממישור הכיפוף, צד השקעים) - מחוץ למסלול ידית הלחיצה.
# הצינור נלחץ פנימה בקליק (פתח 7 לצינור 8-9), לא צריך להשחיל.
hose_d_c, cw, copen, cL = 9.2, 2.2, 7.0, 22.0
cx = od/2 + cw + hose_d_c/2; cro = hose_d_c/2 + cw
for u in (75.0, 150.0):                                     # מרחק מסוף הקשת לאורך האחיזה
    clip = Manifold.cylinder(cL, cro, cro, 48).translate([0, cx, 0])
    clip += Manifold.cube([2*cro, cx - od/2 + 2, cL]).translate([-cro, od/2 - 2, 0])
    clip -= Manifold.cylinder(cL + 2, hose_d_c/2, hose_d_c/2, 48).translate([0, cx, -1])
    clip -= Manifold.cube([copen, 20, cL + 2]).translate([-copen/2, cx, -1])
    for sg in (1, -1):
        clip -= Manifold.cube([3, 3, cL + 2]).rotate([0, 0, 45]).translate([sg*(copen/2 + 1.6), cx + cro - 0.6, -1])
    handle_i += place(clip, pts[-2] + u*d, d)
handle_i -= place(cyl(od - 2*wall, grip_L + 2).translate([0, 0, -1]), pts[-2], d)                    # מעבר האוויר נשאר פתוח
# בדיקות: האום הרגיל מתברג על ההברגה; הטבעת יושבת במושב; מעבר אוויר פתוח
N = nut().rotate([180, 0, 0])
print('nut vs handle body at best phase:', min(round((N.rotate([0,0,a]).translate([0,0,face-shoulder]) ^ handle_i).volume(), 1) for a in range(0,360,30)), '(0 = מתברג נקי)')
R_ = ring().translate([0, 0, face - seat_depth]).rotate([180,0,0]).translate([0,0,face])   # טבעת במושב
print('ring/body overlap:', round((R_ ^ handle_i).volume(), 2))
probe = cyl(25, 60).translate([0, 0, 5]); print('airway blocked (stub):', round((handle_i ^ probe).volume(), 2))
hp = handle_i.rotate([0, -angle_deg, 0]).rotate([180, 0, 0]); bb = hp.bounding_box(); hp = hp.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
me = hp.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_integrated_print.obj'); t.export('handle_integrated_print.stl')
bb = hp.bounding_box(); print('handle_integrated', hp.status(), 'height %.0f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], hp.volume()/1000))
