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
# עין חיצונית לצינור המים ליד בית ה-36: באמצע (במישור הכיפוף, צד פנימי), צמודה לגוף מבחוץ, לא עוברת דרכו.
hb_d, hb_w, eye_L = 9.4, 2.5, 45.0
e_r = od/2 + hb_w + hb_d/2 - 0.8                            # מרכז העין: 1.7 מ"מ חפיפה עם דופן הצינור לחיבור חזק
e_u1 = grip_L - sock_depth - 6.0                            # נגמרת בתחילת המעבר לבית ה-36
e_u0 = e_u1 - eye_L
eye = Manifold.cylinder(eye_L, hb_d/2 + hb_w, hb_d/2 + hb_w, 48).translate([e_r, 0, e_u0])
eye += Manifold.cube([e_r - od/2 + 2, 2*(hb_d/2 + hb_w) - 2, eye_L]).translate([od/2 - 2, -(hb_d/2 + hb_w) + 1, e_u0])   # גשר לגוף
eye -= Manifold.cylinder(eye_L + 2, hb_d/2, hb_d/2, 48).translate([e_r, 0, e_u0 - 1])
eye -= Manifold.cylinder(1.5, hb_d/2 + 1.5, hb_d/2, 48).translate([e_r, 0, e_u0 - 0.01])          # פזות כניסה
eye -= Manifold.cylinder(1.5, hb_d/2, hb_d/2 + 1.5, 48).translate([e_r, 0, e_u1 - 1.49])
# הקצה התחתון של העין (למעלה בהדפסה): משופע 45° כדי שלא תהיה תלייה; בהדפסה הבית למטה אז e_u0 למעלה - פתוח למעלה, בסדר.
handle_i += place(eye, pts[-2], d)
handle_i -= place(cyl(od - 2*wall, grip_L + 2).translate([0, 0, -1]), pts[-2], d)                 # מעבר האוויר 26 לכל האורך
handle_i -= place(hole, end_p, d)
print('CHECK eye bore outside the tube wall (gap mm): %.1f  required > 0' % (e_r - hb_d/2 - od/2))
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
