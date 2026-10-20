# מתאם קצה: מתלבש על צינור 38 ומתחבר לצינור שאיבה 36.
# גרסה A (spigot): צינור השאיבה מתלבש *על* המתאם (פנים הצינור 36).
# גרסה B (socket): צינור השאיבה נכנס *לתוך* המתאם (חוץ הצינור 36).
import numpy as np, trimesh
from manifold3d import Manifold
F = 128
tube_d, cl   = 38.0, 0.3          # צינור הקרבון / קצה הידית
sock_depth   = 40.0               # עומק הכניסה של ה-38
wall         = 4.0
hose_d       = 36.0
A_len, A_bore = 45.0, 30.0        # אורך הזיז ל-36 וקוטר מעבר האוויר
barb_h, barb_len = 0.8, 3.0       # שפה קטנה בקצה שמחזיקה את הצינור
B_depth, B_cl = 45.0, 0.3

cyl = lambda d, h, d2=None: Manifold.cylinder(h, d/2, (d2 if d2 else d)/2, F)
sid = tube_d + cl; sod = sid + 2*wall     # 38.3 / 46.3

def base():
    """בית ל-38 (z=0..40) + מעבר קוני; מחזיר (גוף, חיתוך)"""
    b = cyl(sod, sock_depth)
    c = cyl(sid, sock_depth+1).translate([0,0,-1])
    c += cyl(sid+1.5, 1.5, d2=sid).translate([0,0,-0.01])       # פזת כניסה
    return b, c

def adapter_A():
    b, c = base()
    trans = (sod - hose_d)/2 + 1                                # מעבר 45°-ish
    b += cyl(sod, trans, d2=hose_d).translate([0,0,sock_depth])
    top = sock_depth + trans
    b += cyl(hose_d, A_len).translate([0,0,top])
    b += cyl(hose_d, barb_len, d2=hose_d+2*barb_h).translate([0,0,top+A_len-barb_len-2])   # שיפוע לשפה
    b += cyl(hose_d+2*barb_h, 2).translate([0,0,top+A_len-2])
    c += cyl(sid, (sid-A_bore)/2, d2=A_bore).translate([0,0,sock_depth-0.01])  # מדרגה פנימית 45°
    c += cyl(A_bore, A_len+trans+2).translate([0,0,sock_depth])
    c += cyl(A_bore, 1, d2=A_bore+2).translate([0,0,top+A_len-0.99])
    return b - c

def adapter_B():
    b, c = base()
    bid = hose_d + B_cl; bod = max(sod, bid + 2*wall)          # 36.3 / 46.3
    b += cyl(sod, 3).translate([0,0,sock_depth])                # מחיצה
    b += cyl(bod, B_depth).translate([0,0,sock_depth+3])
    c += cyl(sid, (sid-32)/2, d2=32).translate([0,0,sock_depth-0.01])
    c += cyl(32, 6).translate([0,0,sock_depth])                 # מעבר אוויר 32
    c += cyl(32, (bid-32)/2, d2=bid).translate([0,0,sock_depth+3])
    c += cyl(bid, B_depth+1).translate([0,0,sock_depth+3+(bid-32)/2-0.01])
    c += cyl(bid+1.5, 1.5, d2=bid).translate([0,0,sock_depth+3+B_depth-1.49])
    return b - c

def export(m, name):
    me = m.to_mesh(); V = np.asarray(me.vert_properties)[:,:3]; Fc = np.asarray(me.tri_verts)
    trimesh.Trimesh(V, Fc, process=False).export(name)
    bb = m.bounding_box(); print(name, m.status(), 'size %.1f x %.1f, volume %.1f cm3' % (bb[3]-bb[0], bb[5]-bb[2], m.volume()/1000))

export(adapter_A(), 'hose_adapter_A_spigot36.obj')
export(adapter_B(), 'hose_adapter_B_socket36.obj')
