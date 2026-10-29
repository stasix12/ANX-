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
# תעלה פנימית לצינור המים לאורך האחיזה (כמו בידית הווילונות): קדח 9.4 בתוך אונה שנמשכת מהצינור,
# בצד הפנימי מוסט 35° ממישור ההדק. מעבר האוויר באחיזה מוקטן ל-24 באזור התעלה. ליד בית ה-36 התעלה
# נוטה החוצה כדי לעקוף את הבית ויוצאת בקצה, לידו.
hb_d, hb_w = 9.4, 2.5
th = np.radians(35.0)
air_n = 24.0
r_in = air_n/2 + hb_w + hb_d/2                              # 19.2 - מרכז התעלה לאורך האחיזה
r_out = sock_id/2 + hb_w + hb_d/2                           # 25.3 - מרכז התעלה ליד בית ה-36
u_sock = grip_L - sock_depth - 6                            # תחילת המעבר לבית
wps = [(12.0, r_in), (u_sock - 18.0, r_in), (u_sock + 4.0, r_out), (grip_L + 1.0, r_out)]
def disk_pts(u, rc, rad, n=40):
    return [[rc*np.cos(th) + rad*np.cos(a), rc*np.sin(th) + rad*np.sin(a), u] for a in np.linspace(0, 2*np.pi, n, endpoint=False)]
lobe = None; hbore = None
for (u0_, r0_), (u1_, r1_) in zip(wps[:-1], wps[1:]):
    seg = Manifold.hull_points(disk_pts(u0_, r0_, hb_d/2 + hb_w) + disk_pts(u1_, r1_, hb_d/2 + hb_w)
                               + [[od/2*np.cos(a), od/2*np.sin(a), u0_] for a in np.linspace(0, 2*np.pi, 64, endpoint=False)]
                               + [[od/2*np.cos(a), od/2*np.sin(a), u1_] for a in np.linspace(0, 2*np.pi, 64, endpoint=False)])
    seg = seg ^ Manifold.hull_points([[(r0_ + hb_d/2 + hb_w + 6)*np.cos(a), (r0_ + hb_d/2 + hb_w + 6)*np.sin(a), u0_] for a in np.linspace(0, 2*np.pi, 64, endpoint=False)]
                                      + [[(r1_ + hb_d/2 + hb_w + 6)*np.cos(a), (r1_ + hb_d/2 + hb_w + 6)*np.sin(a), u1_] for a in np.linspace(0, 2*np.pi, 64, endpoint=False)])
    lobe = seg if lobe is None else lobe + seg
    b = Manifold.hull_points(disk_pts(u0_ - 1, r0_, hb_d/2) + disk_pts(u1_ + 1, r1_, hb_d/2))
    hbore = b if hbore is None else hbore + b
# הגבלת האונה לצד ה-θ בלבד (מחצית המישור שפונה לתעלה), כדי לא לעבות את כל הצינור
half = Manifold.cube([200, 200, 400]).translate([0, -100, -50]).rotate([0, 0, np.degrees(th)])
lobe = lobe ^ half
mouth = Manifold.hull_points(disk_pts(11.0, r_in, hb_d/2 + 1.5) + disk_pts(14.0, r_in, hb_d/2))   # פזה בכניסה
handle_i += place(lobe, pts[-2], d)
for (u0_, r0_), (u1_, r1_) in zip(wps[:-1], wps[1:]):       # סוויפ כדורים לאורך המסלול - קדח עגול אמיתי גם בקטע האלכסוני
    for t_ in np.linspace(0, 1, int((u1_ - u0_)/1.5) + 2):
        hbore += Manifold.sphere(hb_d/2, 24).translate([(r0_ + t_*(r1_ - r0_))*np.cos(th), (r0_ + t_*(r1_ - r0_))*np.sin(th), u0_ + t_*(u1_ - u0_)])
handle_i -= place(hbore + mouth, pts[-2], d)
# מעבר אוויר באחיזה: 24 באזור התעלה, עם מעברים 45°
narrow_from, narrow_to = 8.0, u_sock - 20.0
air_cut = cyl(air_n, narrow_to - narrow_from).translate([0, 0, narrow_from])
air_cut += cyl(od - 2*wall, (od - 2*wall - air_n)/2, d2=air_n).translate([0, 0, narrow_from - (od - 2*wall - air_n)/2])
air_cut += cyl(air_n, (od - 2*wall - air_n)/2, d2=od - 2*wall).translate([0, 0, narrow_to])
# הקטנת מעבר האוויר = הוספת חומר: ממלאים את ה-26 באזור ואז חותכים 24
fill = cyl(od - 2*wall + 0.2, narrow_to - narrow_from + 2*(od - 2*wall - air_n)/2).translate([0, 0, narrow_from - (od - 2*wall - air_n)/2])
handle_i += place(fill, pts[-2], d)
handle_i -= place(air_cut, pts[-2], d)
handle_i -= place(cyl(od - 2*wall, narrow_from + 1).translate([0, 0, -1]), pts[-2], d)
handle_i -= place(cyl(od - 2*wall, grip_L - narrow_to + 2).translate([0, 0, narrow_to + (od - 2*wall - air_n)/2 - 0.01]), pts[-2], d)
handle_i -= place(hole, end_p, d)                                                                   # בית ה-36 נשאר פתוח
print('CHECK hose bore clears airway (wall mm): %.1f  required >= 2.4' % (r_in - hb_d/2 - air_n/2))
print('CHECK hose bore clears 36 socket (wall mm): %.1f  required >= 2.4' % (r_out - hb_d/2 - sock_id/2))
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
