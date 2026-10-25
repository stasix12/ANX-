# מתאם קצה 38->36 עם הידוק: הצד של ה-38 הוא חצי מגוף המחבר הדק (הברגה + מושב קוני),
# ומשתמש באותם אום וטבעת של המחבר הדק. הצד של ה-36 הוא בית למחבר השאיבה.
import numpy as np, trimesh
from manifold3d import Manifold
exec(open('build_slim.py').read().split("def save")[0])   # מייבא גיאומטריה ופרמטרים של המחבר הדק

hose_d, hose_cl, hose_depth = 36.0, 0.2, 50.0
air_d, part_t = 32.0, 3.0
sock_od = 46.3

def adapter():
    h = half_body().rotate([180,0,0]).translate([0,0,face])     # הפנים עם המושב ב-z=0, הצינור נכנס מלמטה עד z=37
    z0 = face
    b = h + cyl(54, part_t, d2=sock_od).translate([0,0,z0])      # מחיצה + מעבר לקוטר הבית
    b += cyl(sock_od, hose_depth).translate([0,0,z0+part_t])
    hid = hose_d + hose_cl
    c  = cyl(bore, (bore-air_d)/2, d2=air_d).translate([0,0,z0-(bore-air_d)/2-0.01])  # מדרגה 45° מהצינור למעבר האוויר
    c += cyl(air_d, part_t+2).translate([0,0,z0-1])
    c += cyl(air_d, (hid-air_d)/2, d2=hid).translate([0,0,z0+part_t-0.01])            # מדרגה 45° למעבר לבית
    c += cyl(hid, hose_depth+1).translate([0,0,z0+part_t+(hid-air_d)/2-0.01])
    c += cyl(hid+1.5, 1.5, d2=hid).translate([0,0,z0+part_t+hose_depth-1.49])        # פזה
    return b - c

m = adapter()
me = m.to_mesh(); V = np.asarray(me.vert_properties)[:,:3]; Fc = np.asarray(me.tri_verts)
t = trimesh.Trimesh(V, Fc, process=False); t.export('end_adapter_clamp.stl'); t.export('end_adapter_clamp.obj')
bb = m.bounding_box(); print('status', m.status(), 'size %.1f x %.1f, %.1f cm3' % (bb[3]-bb[0], bb[5]-bb[2], m.volume()/1000))
# בדיקה: האום הדק מתברג על המתאם (מהצד התחתון)
N = nut().rotate([180,0,0])
for ang in range(0, 360, 30):
    X = N.rotate([0,0,ang]).translate([0,0,face-shoulder]) ^ m
    print(ang, round(X.volume(),1), end=' | ')
