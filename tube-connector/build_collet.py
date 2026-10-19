# מחבר קולט (collet) לשני צינורות 38 מ"מ - בלי ברגים.
# 3 חלקים: גוף מרכזי עם אצבעות מחץ בשני הקצוות + 2 אומים.
# הידוק האום מכניס את האצבעות לתוך קונוס ומוחץ אותן על הצינור.
# הרצה: python3 build_collet.py  ->  collet_body.stl, collet_nut.stl (x2)
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection

F = 128
tube_d, cl = 38, 0.3
bore      = tube_d + cl          # 38.3
stop_d    = 31                   # טבעת עצירה במרכז
finger_od = 46                   # קוטר האצבעות (עובי דופן 3.85)
n_slits, slit_w = 8, 1.6
# ציר z מהמרכז החוצה (צד אחד):
shoulder  = 6                    # כתף 0..6, קוטר 56
thr_len   = 14                   # הברגה 6..20
fing_len  = 32                   # אצבעות 20..52
slit_len  = 24                   # חריצים 28..52
half_L    = shoulder + thr_len + fing_len   # 52
# הברגה (טרפז 45°, בלי תמיכות)
pitch, depth, thr_major, thr_cl = 4.0, 1.5, 54.0, 0.4
# אום
nut_thr, nut_plain, nut_cone, nut_lip = 14, 23, 10, 3
nut_L   = nut_thr + nut_plain + nut_cone + nut_lip     # 47
cone_d0, cone_d1 = 48.0, 44.0   # הקונוס מתכווץ כלפי חוץ -> מוחץ את האצבעות
nut_od, n_ribs = 62, 12

cyl = lambda d, h, n=F, d2=None: Manifold.cylinder(h, d/2, (d2 if d2 else d)/2, n)
box = lambda x, y, z: Manifold.cube([x, y, z])

def thread(major, length, radial_offset=0.0):
    rmin = major/2 - depth + radial_offset
    flank = depth / pitch; flat = (1 - 2*flank) / 2
    def prof(u):
        if u < flat: return 0.0
        if u < flat + flank: return (u - flat) / flank
        if u < 2*flat + flank: return 1.0
        return 1 - (u - 2*flat - flank) / flank
    n = 360
    pts = [((rmin + depth*prof(i/n))*np.cos(2*np.pi*i/n), (rmin + depth*prof(i/n))*np.sin(2*np.pi*i/n)) for i in range(n)]
    turns = length / pitch
    return Manifold.extrude(CrossSection([pts]), length, int(turns*48), 360*turns)

def half_body():
    b  = cyl(56, shoulder)
    b += thread(thr_major, thr_len).translate([0,0,shoulder])
    b += cyl(finger_od, fing_len-1.5).translate([0,0,shoulder+thr_len])
    b += cyl(finger_od, 1.5, d2=finger_od-3).translate([0,0,half_L-1.5])   # פזה בקצה
    c  = cyl(bore, half_L+2).translate([0,0,-1])
    c += cyl(bore, 1.5, d2=bore+1.5).translate([0,0,half_L-1.49])          # פזת כניסה
    for i in range(n_slits):
        c += box(finger_od, slit_w, slit_len+1).translate([0, -slit_w/2, half_L-slit_len]).rotate([0,0,360*i/n_slits])
    return b - c

def body():
    h = half_body()
    m = h + h.rotate([180,0,0])
    stop = cyl(bore+1, 2) - cyl(stop_d, 4).translate([0,0,-1])
    return m + stop.translate([0,0,-1])

def nut():
    outer = cyl(nut_od, nut_L)
    for i in range(n_ribs):   # צלעות אחיזה
        outer += box(4, 5, nut_L-6).translate([nut_od/2-1.5, -2.5, 3]).rotate([0,0,360*i/n_ribs])
    outer += cyl(nut_od+1, 3, d2=nut_od-2).translate([0,0,nut_L-3]) - cyl(nut_od-2, 4).translate([0,0,nut_L-3.5])
    # ציר z של האום: 0 = הצד שפונה למרכז הגוף
    tl = nut_thr + 1
    hole = (cyl(thr_major-2*depth+2*thr_cl, tl+1) + thread(thr_major, tl+1, thr_cl)).translate([0,0,-1])
    hole += cyl(thr_major+2*thr_cl+2, 2, d2=thr_major+2*thr_cl-2).translate([0,0,-0.01])  # פזה
    hole += cyl(50, nut_plain+2).translate([0,0,nut_thr-1])
    hole += cyl(cone_d0, nut_cone, d2=cone_d1).translate([0,0,nut_thr+nut_plain])
    hole += cyl(41, nut_lip+2).translate([0,0,nut_thr+nut_plain+nut_cone-0.01])
    return outer - hole

def save(m, name):
    me = m.to_mesh(); t = trimesh.Trimesh(me.vert_properties[:,:3], me.tri_verts); t.export(name)
    print(name, 'watertight', t.is_watertight, np.round(t.bounds,1).tolist(), round(t.volume/1000,1), 'cm3'); return t

if __name__ == '__main__':
    B, N = body(), nut()
    save(B, 'collet_body.stl'); save(N, 'collet_nut.stl')
    # בדיקת התאמה: אום מוברג עד הכתף; חפיפה צפויה רק באזור הקונוס/אצבעות
    for ang in range(0, 360, 30):
        X = N.rotate([0,0,ang]).translate([0,0,shoulder]) ^ B
        if X.volume() > 0.01:
            bb = X.bounding_box(); print(ang, round(X.volume(),1), 'z', round(bb[2],1), '..', round(bb[5],1))
        else: print(ang, 0)
