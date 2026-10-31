# מחבר מוט-מוט "יפה": אותו גוף ואותה טבעת של המחבר הדק, אבל שני אומים ארוכים בצורת חבית שנפגשים באמצע
# ומכסים את הגוף לגמרי. פרופיל חלק עם 6 שקעי אצבעות. מתאים לגוף הדק הקיים ולטבעות הקיימות.
import numpy as np, trimesh, zipfile
from manifold3d import Manifold, CrossSection
import sys
BIG = len(sys.argv) > 1 and sys.argv[1] == 'big'
exec(open('build_ferrule.py' if BIG else 'build_slim.py').read().split("def save")[0])
body_od = 60.0 if BIG else 54.0
tag = '_big' if BIG else ''
skirt_L, lip_L = face - thr_len, 7.0             # 22, 7
nut_len = skirt_L + thr_len + lip_L              # 44: מהמרכז (0.5) ועד 7 אחרי פני הגוף
r_mid, r_end = 32.0, 25.5                        # רדיוס חיצוני במרכז ובקצה
gap = 0.6                                        # רווח בין שני האומים במרכז
def barrel_nut():
    # פרופיל חיצוני (r לאורך z, z=0 = קצה פנימי במרכז הגוף)
    # פרופיל חיצוני: 33 במרכז -> 31 בסוף החצאית -> 29.5 בסוף ההברגה (דופן 3 מעל ההברגה) -> 26 בקצה השפה
    ctrl = [(0.0, body_od/2 + 6.0), (skirt_L, body_od/2 + 4.0), (skirt_L + thr_len, thr_major/2 + 3.5), (nut_len, 26.0)]
    prof = [(0, 0)]
    for (z0, r0), (z1, r1) in zip(ctrl[:-1], ctrl[1:]):
        for i in range(14):
            t = i/14; prof.append((r0 + (r1 - r0)*(0.5 - 0.5*np.cos(np.pi*t)), z0 + t*(z1 - z0)))
    prof += [(0, nut_len)]
    # ניקוי נקודות כפולות (גורמות למשולשים מנוונים ולרשת לא אטומה)
    clean = [prof[0]]
    for p in prof[1:]:
        if abs(p[0]-clean[-1][0]) > 1e-6 or abs(p[1]-clean[-1][1]) > 1e-6: clean.append(p)
    prof = clean
    outer = Manifold.revolve(CrossSection([prof]), F)
    # קליפה דקה שעוקבת אחרי הפרופיל: ממנה נגזרים הפסים כך שעומקם אחיד לאורך כל החבית
    def shell(d):
        inner = [(max(r - d, 0.0), z) for (r, z) in prof]
        return outer - Manifold.revolve(CrossSection([inner]), F)
    # 18 פסי אחיזה אורכיים, רוחב 2.6, עומק 0.9, מ-z=7 עד z=37
    grooves = None
    for i in range(18):
        slab = Manifold.cube([100, 2.6, 30.0]).translate([0, -1.3, 7.0]).rotate([0, 0, 360*i/18 + 10])
        grooves = slab if grooves is None else grooves + slab
    outer -= shell(0.9) ^ grooves
    # שני פסי הדגשה היקפיים דקים (רוחב 0.8, עומק 0.5) בקצוות
    for zc in (4.0, 40.0):
        outer -= shell(0.5) ^ Manifold.cylinder(0.8, 100, 100, 32).translate([0, 0, zc - 0.4])
    tl = thr_len + 1
    minor = thr_major - 2*depth + 2*thr_cl
    hole = cyl(body_od + 0.6, skirt_L + 1).translate([0, 0, -1])                                         # חצאית מעל הכתף של הגוף
    hole += cyl(body_od + 0.6, (body_od + 0.6 - minor)/2, d2=minor).translate([0, 0, skirt_L - (body_od + 0.6 - minor)/2])     # מעבר 45° שמסתיים בתחילת ההברגה
    hole += (cyl(minor, tl + 1) + thread(thr_major, tl + 1, thr_cl)).translate([0, 0, skirt_L - 0.5])
    hole += cyl(40.5, lip_L + 2).translate([0, 0, skirt_L + thr_len - 0.01])
    hole += cyl(40.5, 1, d2=42.5).translate([0, 0, nut_len - 0.99])
    return outer - hole
N = barrel_nut()
B = body()
# בדיקות: האום מתברג על הגוף (חצאית מעל הכתף), שני האומים לא נפגשים, הטבעת נלחצת
Np = N.translate([0, 0, gap/2])                              # האום כשהוא מהודק: קצהו הפנימי 0.3 מהמרכז
best = min(round((Np.rotate([0,0,a]) ^ B).volume(), 1) for a in range(0, 360, 30))
print('nut vs body, best phase:', best, '(0 = מתברג נקי)')
Nm = Np.rotate([180, 0, 0])
print('two nuts overlap:', round((Np ^ Nm).volume(), 2))
R = ring().translate([0, 0, face - seat_depth]); print('lip reaches ring back (overlap>0 means it pushes it):', round((Np ^ R).volume(), 1))
def floor(m):
    bb = m.bounding_box(); return m.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
Nprint = floor(N.rotate([180, 0, 0]))                        # שפה למטה
me = Nprint.to_mesh(); V = np.asarray(me.vert_properties)[:, :3]; Fc = np.asarray(me.tri_verts)
trimesh.Trimesh(V, Fc, process=False).export('barrel_nut%s_print.stl' % tag)
objs, items = [], []
for i, (name, (x, y)) in enumerate([('barrel_nut_1', (-40, 0)), ('barrel_nut_2', (40, 0))], 1):
    objs.append('<object id="%d" name="%s" type="model"><mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object>' % (i, name, ''.join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % tuple(v) for v in V), ''.join('<triangle v1="%d" v2="%d" v3="%d"/>' % tuple(f) for f in Fc)))
    items.append('<item objectid="%d" transform="1 0 0 0 1 0 0 0 1 %.2f %.2f 0"/>' % (i, x, y))
model = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">ANX barrel nuts x2</metadata><resources>%s</resources><build>%s</build></model>') % (''.join(objs), ''.join(items))
rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
with zipfile.ZipFile('barrel_nuts%s_print.3mf' % tag, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('3D/3dmodel.model', model)
bb = Nprint.bounding_box(); print('barrel nut', Nprint.status(), 'OD %.0f, H %.0f, %.1f cm3' % (bb[3]-bb[0], bb[5]-bb[2], Nprint.volume()/1000))
# תצוגה: הרכבה על שני מוטות
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
rod = cyl(38, 120).translate([0, 0, 37]) + cyl(38, 120).translate([0, 0, -157])
Lt = np.array([0.6,-0.5,0.6]); Lt/=np.linalg.norm(Lt)
def coll(m, base):
    me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:,:3], np.asarray(me.tri_verts), process=False)
    s_ = np.clip(t.face_normals@Lt,0,1)*0.75+0.3
    return Poly3DCollection(t.vertices[t.faces], facecolors=np.c_[s_*base[0]+0.08, s_*base[1]+0.08, s_*base[2]+0.08, np.ones_like(s_)].clip(0,1), edgecolors='none')
fig = plt.figure(figsize=(14, 6))
for i, (el, az, ttl) in enumerate([(15, -60, 'barrel connector on the rods'), (0, -90, 'side'), (0, 0, 'end-on')]):
    ax = fig.add_subplot(1, 3, i+1, projection='3d')
    for m, c in [(rod, (0.3,0.3,0.35)), (Np, (0.1,0.1,0.1)), (Nm, (0.1,0.1,0.1))]: ax.add_collection3d(coll(m, c))
    ax.set_xlim(-90, 90); ax.set_ylim(-90, 90); ax.set_zlim(-120, 120); ax.set_box_aspect((1, 1, 1.33)); ax.view_init(el, az); ax.axis('off'); ax.set_title(ttl)
plt.tight_layout(); plt.savefig('preview_barrel%s.png' % tag, dpi=100)
