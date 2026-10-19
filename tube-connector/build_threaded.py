# מחבר הברגה לשני צינורות 38 מ"מ - שני חלקים: זכר (A) ונקבה (B).
# כל חלק מהודק על צינור עם 2 ברגי M5 (ואפשר גם להדביק באפוקסי), והחיבור ביניהם בהברגה.
# הרצה: python3 build_threaded.py  ->  part_A_male.stl, part_B_female.stl
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection

F = 128
tube_d, cl = 38, 0.3          # קוטר צינור ומרווח הדפסה לצינור
sleeve_od  = 48               # קוטר חיצוני של השרוול על הצינור
collar_od  = 58               # קוטר חיצוני באזור ההברגה
sleeve_L   = 56               # אורך אזור ההידוק
stop_d     = 30               # קוטר פנימי של העצירה / המעבר
slit, ear_w, ear_x = 2, 18, 36
bolt_d, head_d, nut_d = 5.5, 10, 9.4
# הברגה: פרופיל טרפז עם דפנות 45° (מודפס בלי תמיכות)
pitch, depth   = 4.0, 1.5
thr_major      = 46.0
thr_len        = 30.0
thr_cl         = 0.4          # מרווח רדיאלי בהברגה (הדוק מדי -> 0.5, משחק -> 0.3)
pilot_d, pilot_L = 42.0, 10.0
pilot_cl       = 0.3

id_ = tube_d + cl
cyl = lambda d, h, n=F, d2=None: Manifold.cylinder(h, d/2, (d2 if d2 else d)/2, n)
box = lambda x, y, z: Manifold.cube([x, y, z])

def thread(major, length, radial_offset=0.0):
    """בורג חד-התחלתי, ימני. החתך הרוחבי מסובב לאורך הגובה."""
    rmin = major/2 - depth + radial_offset
    flank = depth / pitch           # 0.375 - חלק מהפסיעה לכל דופן
    flat = (1 - 2*flank) / 2        # קודקוד ושורש
    def prof(u):                    # u in [0,1)
        if u < flat: return 0.0
        if u < flat + flank: return (u - flat) / flank
        if u < 2*flat + flank: return 1.0
        return 1 - (u - 2*flat - flank) / flank
    n = 360
    pts = []
    for i in range(n):
        th = 2*np.pi*i/n
        r = rmin + depth*prof(i/n)
        pts.append((r*np.cos(th), r*np.sin(th)))
    cs = CrossSection([pts])
    turns = length / pitch
    return Manifold.extrude(cs, length, int(turns*48), 360*turns)

def sleeve_part():
    """שרוול הידוק על הצינור + צווארון, z=0..72. הצינור נכנס מלמטה עד z=64."""
    body = cyl(sleeve_od, sleeve_L) + cyl(sleeve_od, 8, d2=collar_od).translate([0,0,sleeve_L]) \
         + cyl(collar_od, 8).translate([0,0,sleeve_L+8])
    body += box(ear_x-id_/2+4, ear_w, sleeve_L).translate([id_/2-4, -ear_w/2, 0])
    cut = cyl(id_, 65).translate([0,0,-1])                       # קדח לצינור
    cut += cyl(id_, 4.5, d2=stop_d).translate([0,0,64])          # עצירה קונית (בלי תמיכות)
    cut += cyl(stop_d, 20).translate([0,0,60])
    cut += cyl(id_+1.5, 1.5, d2=id_).translate([0,0,-0.01])      # פזת כניסה
    cut += box(ear_x+1, slit, sleeve_L+1).translate([0, -slit/2, -1])  # חריץ הידוק
    for z in (14, 42):
        b = cyl(bolt_d, 2*ear_w, 32).translate([0,0,-ear_w]) \
          + cyl(head_d, ear_w, 32).translate([0,0,5]) \
          + cyl(nut_d, ear_w, 6).translate([0,0,-5-ear_w])
        cut += b.rotate([-90,0,0]).translate([sleeve_od/2+5.5, 0, z])
    return body, cut

TOP = sleeve_L + 16   # 72 - פני החיבור

def part_A():
    body, cut = sleeve_part()
    body += thread(thr_major, thr_len).translate([0,0,TOP])
    body += cyl(pilot_d, pilot_L-1).translate([0,0,TOP+thr_len])
    body += cyl(pilot_d, 1, d2=pilot_d-2).translate([0,0,TOP+thr_len+pilot_L-1])
    cut += cyl(stop_d, thr_len+pilot_L+2).translate([0,0,TOP-1])
    return body - cut

def part_B():
    body, cut = sleeve_part()
    depth_total = thr_len + 1 + pilot_L + 2      # 43
    body += cyl(collar_od, depth_total).translate([0,0,TOP])
    top = TOP + depth_total
    cut += cyl(pilot_d+pilot_cl, pilot_L+2+1).translate([0,0,TOP])   # קדח מוביל
    # הברגה פנימית = בורג מוגדל בקדח
    tlen = thr_len + 1
    hole = cyl(thr_major - 2*depth + 2*thr_cl, tlen+1) + thread(thr_major, tlen+1, thr_cl)
    cut += hole.translate([0,0,top-tlen])
    cut += cyl(thr_major+2*thr_cl+2, 2, d2=thr_major+2*thr_cl-2).translate([0,0,top-1.99])  # פזה
    return body - cut

def save(m, name):
    me = m.to_mesh()
    t = trimesh.Trimesh(me.vert_properties[:,:3], me.tri_verts)
    t.export(name)
    print(name, t.is_watertight, np.round(t.bounds,1).tolist(), round(t.volume/1000,1), 'cm3')
    return t

a = save(part_A(), 'part_A_male.stl')
b = save(part_B(), 'part_B_female.stl')
