# גוף מוט-מוט דק עם תופסן C חיצוני לצינור מים 8-9 מ"מ, לאורך הגוף בין שני האומים
import numpy as np, trimesh
from manifold3d import Manifold
exec(open('build_slim.py').read().split("def save")[0])
hose_d, clip_wall, clip_open, clip_L = 9.2, 2.2, 7.0, 40.0
cx = 27.0 + clip_wall + hose_d/2                       # מרכז התעלה (הגוף ברדיוס 27)
ro = hose_d/2 + clip_wall

def body_with_clip():
    b = body()
    clip = Manifold.cylinder(clip_L, ro, ro, 64).translate([cx, 0, -clip_L/2])
    clip += Manifold.cube([cx - 25.0, 2*ro, clip_L]).translate([25.0, -ro, -clip_L/2])     # גשר לגוף
    clip -= Manifold.cylinder(clip_L + 2, hose_d/2, hose_d/2, 64).translate([cx, 0, -clip_L/2 - 1])  # תעלה
    clip -= Manifold.cube([20, clip_open, clip_L + 2]).translate([cx, -clip_open/2, -clip_L/2 - 1])   # פתח כלפי חוץ
    for s in (1, -1):   # פזות כניסה בפתח
        clip -= Manifold.cube([3, 3, clip_L + 2]).rotate([0, 0, 45]).translate([cx + ro - 0.6, s*(clip_open/2 + 1.6), -clip_L/2 - 1])
    return b + clip

m = body_with_clip()
bb = m.bounding_box(); m = m.translate([0, 0, -bb[2]])
me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('rod_to_rod_body_hoseclip.stl'); t.export('rod_to_rod_body_hoseclip.obj')
bb = m.bounding_box(); print('status', m.status(), 'size %.1f x %.1f x %.1f, clip outer r %.1f, nut r 29.5' % (bb[3]-bb[0], bb[4]-bb[1], bb[5]-bb[2], cx+ro))
# האומים לא נוגעים בתופסן: בדיקה עם אום מהודק עד הכתף משני הצדדים
N = nut(); top = N.translate([0, 0, 37 + shoulder]); bot = N.rotate([180,0,0]).translate([0, 0, 37 - shoulder])
print('nut/clip overlap:', round((top ^ m).volume() + (bot ^ m).volume(), 1))
