# גוף מוט-מוט דק "חלק": המרכז בקוטר 66 כמו האומים המחוזקים, כך שאומים+גוף יוצרים גליל רציף אחד.
# אותה הברגה (52), אותן טבעות ואותם אומים. עם עין לצינור המים 9.4 כמו קודם.
import numpy as np, trimesh, sys
from manifold3d import Manifold
exec(open('build_slim.py').read().split("def save")[0])
NUT_OD = 66.0
mid_half = shoulder - 2.0                     # 20: מרכז בקוטר 66 עד ±20, פזה 45° ל-54 עד ±22
b = body()
b += cyl(NUT_OD, 2*mid_half).translate([0, 0, -mid_half])
b += cyl(NUT_OD, 2.0, d2=NUT_OD - 4.0).translate([0, 0, mid_half])
b += cyl(NUT_OD - 4.0, 2.0, d2=NUT_OD).translate([0, 0, -mid_half - 2.0])
b -= cyl(bore, 2*face + 2).translate([0, 0, -face - 1]) - (cyl(bore + 1, 2) - cyl(stop_d, 4).translate([0, 0, -1])).translate([0, 0, -1])  # קדח + עצירה חוזרים
# עין לצינור מים 9.4, סגורה, לאורך המרכז
hose_d, cw = 9.4, 2.5
cx = NUT_OD/2 + cw + hose_d/2 - 0.8
eye = Manifold.cylinder(2*mid_half, hose_d/2 + cw, hose_d/2 + cw, 48).translate([cx, 0, -mid_half])
eye += Manifold.cube([cx - NUT_OD/2 + 2, 2*(hose_d/2 + cw) - 2, 2*mid_half]).translate([NUT_OD/2 - 2, -(hose_d/2 + cw) + 1, -mid_half])
eye -= Manifold.cylinder(2*mid_half + 2, hose_d/2, hose_d/2, 48).translate([cx, 0, -mid_half - 1])
for z, (d1, d2) in ((-mid_half - 0.01, (hose_d + 3, hose_d)), (mid_half - 1.49, (hose_d, hose_d + 3))):
    eye -= Manifold.cylinder(1.5, d1/2, d2/2, 48).translate([cx, 0, z])
b += eye
# בדיקות
N = nut()
print('nut screws on (best phase):', min(round((N.translate([0,0,shoulder]) .rotate([0,0,a]) ^ b).volume(), 1) for a in range(0,360,30)))
print('airway blocked (30mm probe):', round((cyl(30, 100).translate([0,0,-50]) ^ b).volume(), 2))
bb = b.bounding_box(); bp = b.translate([0, 0, -bb[2]])
me = bp.to_mesh(); trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False).export('rod_to_rod_body_flush.stl')
print('body_flush', bp.status(), 'size %.0f x %.0f x %.0f' % (bb[3]-bb[0], bb[4]-bb[1], bb[5]-bb[2]))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
rod = cyl(38, 120).translate([0, 0, 37]) + cyl(38, 120).translate([0, 0, -157])
Nn = nut_outer(nut_L) if False else None
exec(open('build_slim.py').read().split("def save")[0])
nut_od = 66.0; nut_lip = 7.0; nut_L_s = nut_thr + nut_plain + nut_lip
def nut_strong():
    outer = nut_outer(nut_L_s); tl = nut_thr + 1; minor = thr_major - 2*depth + 2*thr_cl
    hole = (cyl(minor, tl + 1) + thread(thr_major, tl + 1, thr_cl)).translate([0, 0, -1])
    hole += cyl(thr_major + 2*thr_cl + 2, 2, d2=thr_major + 2*thr_cl - 2).translate([0, 0, -0.01])
    hole += cyl(thr_major + 2*thr_cl + 1, nut_plain + 1).translate([0, 0, nut_thr - 0.5])
    hole += cyl(minor, 2.0, d2=minor - 4.0).translate([0, 0, nut_thr + nut_plain - 0.01])
    hole += cyl(40.5, nut_lip + 2).translate([0, 0, nut_thr + nut_plain + 2.0 - 0.01])
    hole += cyl(40.5, 1, d2=42.5).translate([0, 0, nut_L_s - 0.99])
    return outer - hole
Ns = nut_strong()
n1 = Ns.translate([0, 0, shoulder + 1.5]); n2 = Ns.rotate([180,0,0]).translate([0, 0, -shoulder - 1.5])
hose = Manifold.cylinder(300, 4.3, 4.3, 24).translate([cx, 0, -150])
Lt = np.array([0.6,-0.5,0.6]); Lt/=np.linalg.norm(Lt)
def coll(m, base):
    me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:,:3], np.asarray(me.tri_verts), process=False)
    s_ = np.clip(t.face_normals@Lt,0,1)*0.75+0.3
    return Poly3DCollection(t.vertices[t.faces], facecolors=np.c_[s_*base[0]+0.08, s_*base[1]+0.08, s_*base[2]+0.08, np.ones_like(s_)].clip(0,1), edgecolors='none')
fig = plt.figure(figsize=(12, 6))
for i, (el, az, ttl) in enumerate([(15, -60, 'flush body (66) + existing strong nuts'), (0, 90, 'hose side')]):
    ax = fig.add_subplot(1, 2, i+1, projection='3d')
    for m, c in [(rod, (0.3,0.3,0.35)), (b, (0.1,0.1,0.1)), (n1, (0.1,0.1,0.1)), (n2, (0.1,0.1,0.1)), (hose, (0.85,0.15,0.15))]: ax.add_collection3d(coll(m, c))
    ax.set_xlim(-90, 90); ax.set_ylim(-90, 90); ax.set_zlim(-120, 120); ax.set_box_aspect((1, 1, 1.33)); ax.view_init(el, az); ax.axis('off'); ax.set_title(ttl)
plt.tight_layout(); plt.savefig('preview_body_flush.png', dpi=100)
