# מחבר לחיצה עם טבעת מחץ (ferrule / olive) לשני צינורות 38 מ"מ - בלי ברגים, בלי אצבעות דקות.
# 5 חלקים: גוף מרכזי + 2 טבעות מחץ + 2 אומים.
# האום דוחף את הטבעת לתוך מושב קוני בגוף, והטבעת (עם חריץ אחד) נסגרת על הצינור.
# הרצה: python3 build_ferrule.py -> ferrule_body.stl, ferrule_ring.stl (x2), ferrule_nut.stl (x2)
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection

F = 128
tube_d, cl = 38, 0.3
bore    = tube_d + cl            # 38.3
stop_d  = 31
# גוף, ציר z מהמרכז החוצה (צד אחד)
shoulder, thr_len = 22, 18       # כתף 0..22 (קוטר 60), הברגה 22..40
face = shoulder + thr_len        # 24 - פני הקצה
seat_d_face, seat_d_tip, seat_depth = 47.0, 42.0, 10.0   # מושב קוני: 47 בפנים -> 42 בעומק 10 (14°)
# הברגה
pitch, depth, thr_major, thr_cl = 4.0, 1.5, 56.0, 0.4
# טבעת מחץ
ring_taper_L, ring_cyl_L = 8.0, 6.0      # קונוס 42->46 ואז גליל 46
ring_slit = 2.0
# אום
nut_thr, nut_plain, nut_lip = 18, 0, 5
nut_L  = nut_thr + nut_plain + nut_lip   # 23
nut_od, n_ribs = 64, 12

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
    b  = cyl(60, shoulder) + thread(thr_major, thr_len).translate([0,0,shoulder])
    c  = cyl(bore, face+2).translate([0,0,-1])
    c += cyl(seat_d_tip, seat_depth+0.01, d2=seat_d_face).translate([0,0,face-seat_depth])   # מושב קוני
    return b - c

def body():
    h = half_body()
    m = h + h.rotate([180,0,0])
    stop = cyl(bore+1, 2) - cyl(stop_d, 4).translate([0,0,-1])
    return m + stop.translate([0,0,-1])

def ring():
    r  = cyl(seat_d_tip, ring_taper_L, d2=46).translate([0,0,0])
    r += cyl(46, ring_cyl_L).translate([0,0,ring_taper_L])
    c  = cyl(bore, 30).translate([0,0,-1])
    c += cyl(bore+1.2, 1, d2=bore).translate([0,0,-0.01])      # פזה בכניסה
    c += box(30, ring_slit, 30).translate([0, -ring_slit/2, -1])
    return r - c

def nut():
    outer = cyl(nut_od, nut_L)
    for i in range(n_ribs):
        outer += box(4, 5, nut_L-4).translate([nut_od/2-1.5, -2.5, 2]).rotate([0,0,360*i/n_ribs])
    tl = nut_thr + 1
    hole = (cyl(thr_major-2*depth+2*thr_cl, tl+1) + thread(thr_major, tl+1, thr_cl)).translate([0,0,-1])
    hole += cyl(thr_major+2*thr_cl+2, 2, d2=thr_major+2*thr_cl-2).translate([0,0,-0.01])
    hole += cyl(50, nut_plain+1).translate([0,0,nut_thr-0.5])
    hole += cyl(40.5, nut_lip+2).translate([0,0,nut_thr+nut_plain-0.01])
    hole += cyl(40.5, 1, d2=42.5).translate([0,0,nut_L-0.99])
    return outer - hole

def save(m, name):
    me = m.to_mesh(); t = trimesh.Trimesh(me.vert_properties[:,:3], me.tri_verts); t.export(name)
    print(name, 'status', m.status(), np.round(t.bounds,1).tolist(), round(t.volume/1000,1), 'cm3'); return t

if __name__ == '__main__':
    B, R, N = body(), ring(), nut()
    save(B, 'ferrule_body.stl'); save(R, 'ferrule_ring.stl'); save(N, 'ferrule_nut.stl')
    # הטבעת במנוחה: הקצה נוגע במושב בעומק 10, הגב בולט 4 מ"מ מהפנים
    Rp = R.translate([0,0,face-seat_depth])
    print('ring/body overlap', round((Rp ^ B).volume(),2), 'ring back z', face-seat_depth+ring_taper_L+ring_cyl_L)
    for ang in range(0, 360, 30):   # אום מוברג עד הכתף
        X = N.rotate([0,0,ang]).translate([0,0,shoulder]) ^ B
        print(ang, round(X.volume(),1))
