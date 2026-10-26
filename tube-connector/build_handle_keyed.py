# ידית עם אוגן שיניים (נעולה נגד סיבוב) - משתמשת בגיאומטריה של build_handle.py ו-build_keyed.py
import numpy as np, trimesh, zipfile
from manifold3d import Manifold
exec(open('build_keyed.py').read().split("if __name__")[0])
src = open('build_handle.py').read().split("me = handle.to_mesh()")[0]
src = src.replace("stub_L     = 65.0", "stub_L     = %.1f" % (pilot_L + flange_t)).replace("grip_L     = 195.0", "grip_L     = 215.0")
exec(src)
handle_k = handle + (flange_part() - cyl(od - 2*wall, pilot_L + flange_t + 2).translate([0, 0, -1]))
# בית למחבר שואב 36 בקצה האחיזה: התרחבות ל-46 חיצוני, קדח 36.2 בעומק 50, מדרגה 45° ל-26
sock_id, sock_od, sock_depth = 36.2, 46.0, 50.0
end_p = pts[-1]; d = end_dir
sock = cyl(od, 6, d2=sock_od).translate([0,0,-sock_depth-6]) + cyl(sock_od, sock_depth).translate([0,0,-sock_depth])
hole = cyl(sock_id, sock_depth+1).translate([0,0,-sock_depth]) + cyl(od-2*wall, (sock_id-(od-2*wall))/2, d2=sock_id).translate([0,0,-sock_depth-(sock_id-(od-2*wall))/2+0.01])
hole += cyl(sock_id+1.5, 1.5, d2=sock_id).translate([0,0,-1.49])
sock = (sock - hole)
handle_k = handle_k + place(sock, end_p, d) - place(hole, end_p, d)
m = handle_k.rotate([0, -angle_deg, 0]).rotate([180, 0, 0])
bb = m.bounding_box(); m = m.translate([-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]])
bb = m.bounding_box(); print('handle_keyed', m.status(), 'height %.1f, footprint %.0f x %.0f, %.0f cm3' % (bb[5], bb[3]-bb[0], bb[4]-bb[1], m.volume()/1000))
me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
t.export('handle_keyed_print.obj'); t.export('handle_keyed_print.stl')

# 3MF של חלקי המחבר: גוף, אום ידית, אום קרבון, טבעת
B = keyed_body(); N, NL = handle_nut()
parts = [('keyed_body', B.translate([0,0,37]), (0,0)), ('handle_nut', N, (80,0)), ('carbon_nut', nut(), (-80,0)), ('ring', ring().rotate([180,0,0]).translate([0,0,12]), (-80,70))]
objs, items = [], []
for i, (name, mm, (x, y)) in enumerate(parts, 1):
    me = mm.to_mesh(); V = np.asarray(me.vert_properties)[:, :3]; Fc = np.asarray(me.tri_verts)
    print(name, mm.status(), 'z %.1f..%.1f' % (V[:,2].min(), V[:,2].max()))
    objs.append('<object id="%d" name="%s" type="model"><mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object>' % (i, name,
        ''.join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % tuple(v) for v in V), ''.join('<triangle v1="%d" v2="%d" v3="%d"/>' % tuple(f) for f in Fc)))
    items.append('<item objectid="%d" transform="1 0 0 0 1 0 0 0 1 %.2f %.2f 0"/>' % (i, x, y))
model = ('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
 '<metadata name="Title">ANX keyed rod-handle connector</metadata><resources>%s</resources><build>%s</build></model>') % (''.join(objs), ''.join(items))
rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
with zipfile.ZipFile('keyed_connector_print.3mf', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('3D/3dmodel.model', model)

# תצוגה: הרכבה בחתך
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
half = Manifold.cube([400, 200, 600]).translate([-200, -200, -100])
hk = handle_k.translate([0, 0, h_face + teeth_h - pilot_L])
Nn = N.translate([0, 0, 6]); Nc = nut().rotate([180,0,0]).translate([0,0,-37+13]); Rg = ring().rotate([180,0,0]).translate([0,0,-37+seat_depth+2])
rod = cyl(38, 60).translate([0,0,-60-2])
Lt = np.array([0.5,-0.6,0.6]); Lt /= np.linalg.norm(Lt)
def coll(t, base):
    s = np.clip(t.face_normals@Lt, 0, 1)*0.7+0.25
    return Poly3DCollection(t.vertices[t.faces], facecolors=np.c_[s*base[0], s*base[1], s*base[2], np.ones_like(s)].clip(0,1), edgecolors='none')
fig = plt.figure(figsize=(12, 7))
ax = fig.add_subplot(1, 2, 1, projection='3d')
for mm, c in [(B,(1,.85,.6)), (hk,(.95,.7,.4)), (Nn,(.6,.8,1)), (Nc,(.6,.8,1)), (Rg,(.6,.9,.6)), (rod,(.3,.3,.3))]:
    me = (mm - half).to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:,:3], np.asarray(me.tri_verts), process=False); ax.add_collection3d(coll(t, c))
ax.set_xlim(-60,60); ax.set_ylim(-60,60); ax.set_zlim(-65,100); ax.set_box_aspect((1,1,1.4)); ax.view_init(18,-55); ax.axis('off'); ax.set_title('cutaway: rod (grey) - body - toothed flange - handle')
ax = fig.add_subplot(1, 2, 2, projection='3d')
me = B.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:,:3], np.asarray(me.tri_verts), process=False); ax.add_collection3d(coll(t,(1,.85,.6)))
ax.set_xlim(-35,35); ax.set_ylim(-35,35); ax.set_zlim(-40,30); ax.set_box_aspect((1,1,1)); ax.view_init(40,-60); ax.axis('off'); ax.set_title('body: 24 teeth on the handle face')
plt.tight_layout(); plt.savefig('preview_keyed.png', dpi=100)
