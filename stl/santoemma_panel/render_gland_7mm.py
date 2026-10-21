"""Renders gland7_preview.png: gland in the 5 mm panel (half section) + exploded parts.  python3 render_gland_7mm.py"""
import numpy as np, trimesh
from PIL import Image, ImageDraw
from manifold3d import Manifold, Mesh
import render_anx3d as R
from make_gland_7mm import make_body, make_cap, make_locknut, make_wedge, WALL_T, CAP_T
CABLE_D = 8.0
from make_gland import FLANGE_T
from make_box import cyl

def man(path):
    t = trimesh.load(path); return Manifold(Mesh(np.asarray(t.vertices, np.float32), np.asarray(t.faces, np.uint32)))
def vf(m):
    x = m.to_mesh(); return np.asarray(x.vert_properties)[:, :3].astype(float), np.asarray(x.tri_verts)
def look(eye, at, f, w, h):
    d = np.array(at, float) - eye; d /= np.linalg.norm(d)
    r = np.cross(d, [0, 0, 1]); r /= np.linalg.norm(r); u = np.cross(r, d)
    Rm = np.stack([r, -u, d]); K = np.array([[f, 0, w/2], [0, f, h/2], [0, 0, 1]])
    def proj(V, ss):
        c = (V - eye) @ Rm.T; p = c @ K.T; return p[:, :2]/p[:, 2:3]*ss, c[:, 2]
    return proj

CX, FACE = -100.0, 5.0                                    # hole centre, front face of the 5 mm panel
zc = WALL_T + FLANGE_T                                    # cap thread start (body coords)
body = make_body().translate([CX, 0, FACE - WALL_T])
nut = make_locknut().translate([CX, 0, -5.0])
cap = make_cap().translate([CX, 0, FACE - WALL_T + zc + 1.0])                     # 9 of 10 mm engaged
wedge = make_wedge().translate([CX, 0, FACE - WALL_T + zc + CAP_T])                # split wedge on top of the body
cable = cyl(CABLE_D/2, -40, 80).translate([CX, 0, 0])
crop = Manifold.cube([70, 60, 30]).translate([CX-35, -30, -1])
panel_k = man('anx3d_panel_5mm_black.stl') ^ crop
rim_k = man('anx3d_panel_5mm_blue.stl') ^ crop
keep = Manifold.cube([200, 200, 200]).translate([CX-100, 0, -100])        # half section: keep y > 0
parts = {'black': panel_k ^ keep, 'blue': (rim_k ^ keep) + (body ^ keep), 'silver': (cap ^ keep) + (nut ^ keep),
         'housing': wedge ^ keep, 'bezel': cable ^ keep}
meshes = {k: vf(m) for k, m in parts.items()}
W, H = 900, 760
eye = np.array([CX-120, -150, 95.0])
sec = R.render(meshes, look(eye, [CX, 0, 8], 1500, W, H), eye, W, H)
# exploded, whole parts
halves = [wedge ^ Manifold.cube([40, 20, 60]).translate([CX-20, 0, -10]), wedge ^ Manifold.cube([40, 20, 60]).translate([CX-20, -20, -10])]
ex = {'blue': vf(body), 'silver': vf(cap.translate([0, 0, 34]) + nut.translate([0, 0, -18])), 'black': vf(panel_k), 'bezel': vf(cable),
      'housing': vf(halves[0].translate([0, 9, 12]) + halves[1].translate([0, -9, 12]))}
eye2 = np.array([CX-110, -160, 80.0])
exp = R.render(ex, look(eye2, [CX, 0, 15], 1100, W, H), eye2, W, H)
sheet = Image.new('RGB', (2*W, H+40), 'white'); sheet.paste(sec, (0, 40)); sheet.paste(exp, (W, 40))
d = ImageDraw.Draw(sheet)
d.text((20, 12), 'Section: body (blue) through the panel, lock nut behind; the cap (internal thread + cone) presses the 2 wedge halves onto the cable', fill=(0, 0, 0))
d.text((W+20, 12), 'Exploded: lock nut | panel | body | 2 wedge halves | cap   (fits 7-9 mm cables)', fill=(0, 0, 0))
sheet.save('gland7_preview.png')
