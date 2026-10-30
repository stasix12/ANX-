import numpy as np, trimesh, zipfile
from manifold3d import Manifold, CrossSection, FillRule
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties
F = 128
tube, wall, H = 37.4, 4.0, 22.0
hose, hw = 8.4, 2.6
ro = tube/2 + wall
ring = Manifold.cylinder(H, ro, ro, F) - Manifold.cylinder(H+2, tube/2, tube/2, F).translate([0,0,-1])
ring -= Manifold.cube([60, 26.0, H+2]).translate([-70, -13.0, -1])
for sg in (1, -1):
    ring -= Manifold.cube([4, 4, H+2]).rotate([0,0,45]).translate([-tube/2 - 2.0, sg*13.0, -1])
for ang in (0, 55, -55):
    ring += Manifold.cube([0.6, 3.0, H]).translate([tube/2 - 0.45, -1.5, 0]).rotate([0, 0, ang])
cx = ro + hw + hose/2 - 0.8
eye = Manifold.cylinder(H, hose/2 + hw, hose/2 + hw, 48).translate([cx, 0, 0])
eye += Manifold.cube([cx - ro + 2, 2*(hose/2 + hw) - 1, H]).translate([ro - 2, -(hose/2 + hw) + 0.5, 0])
eye -= Manifold.cylinder(H+2, hose/2, hose/2, 48).translate([cx, 0, -1])
eye -= Manifold.cylinder(1.2, hose/2 + 1.2, hose/2, 48).translate([cx, 0, -0.01])
eye -= Manifold.cylinder(1.2, hose/2, hose/2 + 1.2, 48).translate([cx, 0, H - 1.19])
part = ring + eye
# חריטת ANX משני הצדדים, עומק 0.6, גובה אותיות 9
tp = TextPath((0, 0), "ANX", size=9, prop=FontProperties(family='DejaVu Sans', weight='bold'))
polys = []
for p in tp.to_polygons():
    p = np.asarray(p, float)
    if len(p) and np.allclose(p[0], p[-1]): p = p[:-1]
    if len(p) >= 3 and np.all(np.isfinite(p)): polys.append([(float(x), float(y)) for x, y in p])
cs = CrossSection(polys, FillRule.EvenOdd)
bb = cs.bounds(); cs = cs.translate([-(bb[0]+bb[2])/2, -(bb[1]+bb[3])/2])
depth = 0.6
shell = Manifold.cylinder(H+2, ro + 2, ro + 2, F).translate([0,0,-1]) - Manifold.cylinder(H+4, ro - depth, ro - depth, F).translate([0,0,-2])
txt0 = Manifold.extrude(cs, 10).rotate([90, 0, 0]).translate([0, 0, H/2])     # אותיות במישור xz, עובי לאורך y (0..-10)
part -= (txt0.translate([0, ro + 5, 0]) ^ shell)                                # צד +y, קריא מבחוץ
part -= (txt0.mirror([0, 1, 0]).translate([0, -ro - 5, 0]) ^ shell)   # צד -y, קריא מבחוץ
me = part.to_mesh(); V = np.asarray(me.vert_properties)[:, :3]; Fc = np.asarray(me.tri_verts)
trimesh.Trimesh(V, Fc, process=False).export('hose_clip_closed.stl')
objs, items = [], []
for i, (name, (x, y)) in enumerate([('hose_clip_tight_1', (-40, 0)), ('hose_clip_tight_2', (40, 0))], 1):
    objs.append('<object id="%d" name="%s" type="model"><mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object>' % (i, name, ''.join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % tuple(v) for v in V), ''.join('<triangle v1="%d" v2="%d" v3="%d"/>' % tuple(f) for f in Fc)))
    items.append('<item objectid="%d" transform="1 0 0 0 1 0 0 0 1 %.2f %.2f 0"/>' % (i, x, y))
model = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">ANX tight hose clips x2</metadata><resources>%s</resources><build>%s</build></model>') % (''.join(objs), ''.join(items))
rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
with zipfile.ZipFile('hose_clips_closed_print.3mf', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('3D/3dmodel.model', model)
print(part.status(), 'text bbox', np.round(cs.bounds(),1), 'vol %.1f' % (part.volume()/1000))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
t = trimesh.Trimesh(V, Fc, process=False)
fig = plt.figure(figsize=(10,5))
for i,(el,az,ttl,L) in enumerate([(5,-90,'side +y',[0.2,-1,0.4]),(5,90,'side -y',[0.2,1,0.4])]):
    Lt = np.array(L); Lt/=np.linalg.norm(Lt); s_ = np.clip(t.face_normals@Lt,0,1)*0.75+0.3
    ax = fig.add_subplot(1,2,i+1,projection='3d')
    ax.add_collection3d(Poly3DCollection(t.vertices[t.faces], facecolors=np.c_[s_*0.9, s_*0.2, s_*0.2, np.ones_like(s_)].clip(0,1), edgecolors='none'))
    ax.set_xlim(-30,40); ax.set_ylim(-35,35); ax.set_zlim(-25,45); ax.set_box_aspect((1,1,1)); ax.view_init(el,az); ax.axis('off'); ax.set_title(ttl)
plt.tight_layout(); plt.savefig('preview_clip_closeup.png', dpi=110)
