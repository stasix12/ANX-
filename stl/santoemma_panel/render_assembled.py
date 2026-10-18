"""Renders assembled_5mm.png: the 5 mm ANX3D panel on the machine with switches, screws and the 7 mm cable gland fitted.
python3 render_assembled.py   (render-only hardware: housing, rocker switches, screw heads, cable)"""
import os
os.environ.setdefault('PANEL_T', '5')
import numpy as np
from PIL import Image
from manifold3d import Manifold
import render_anx3d as R
from make_anx3d_panel import build, PW, PH, T, CABLE
from make_gland_7mm import make_body, make_screw, WALL_T
from make_gland import FLANGE_T

def vf(m):
    x = m.to_mesh(); return np.asarray(x.vert_properties)[:, :3].astype(float), np.asarray(x.tri_verts)
def look(eye, at, f, w, h):
    d = np.array(at, float) - eye; d /= np.linalg.norm(d)
    r = np.cross(d, [0, 0, 1]); r /= np.linalg.norm(r); u = np.cross(r, d)
    Rm = np.stack([r, -u, d]); K = np.array([[f, 0, w/2], [0, f, h/2], [0, 0, 1]])
    def proj(V, ss):
        c = (V - eye) @ Rm.T; p = c @ K.T; return p[:, :2]/p[:, 2:3]*ss, c[:, 2]
    return proj

cx, cy, _ = CABLE
zs = WALL_T + FLANGE_T
body = make_body().translate([cx, cy, T - WALL_T])
tip = T - WALL_T + zs + 10.0
screw = make_screw().rotate([180, 0, 0]).translate([cx, cy, tip + 19.0])
pts = [(cx, cy, 20), (cx, cy, 52), (cx-2, cy-12, 66), (cx-4, cy-35, 72), (cx-6, cy-80, 66), (cx-8, cy-130, 52)]
ball = lambda p: Manifold.sphere(3.5, 24).translate(p)
cable = Manifold.compose([Manifold.batch_hull([ball(a), ball(b)]) for a, b in zip(pts, pts[1:])])

parts = build(); pr = R.props()
meshes = {k: R.tess(s) for k, s in parts.items()}
meshes.update({k: R.tess(pr[k]) for k in ('housing', 'rocker', 'chrome')})
bez = R.tess(pr['bezel']); gl = vf(body + screw)
meshes['bezel'] = (np.vstack([bez[0], gl[0]]), np.vstack([bez[1], gl[1] + len(bez[0])]))
meshes['housing'] = (np.vstack([meshes['housing'][0], vf(cable)[0]]),
                     np.vstack([meshes['housing'][1], vf(cable)[1] + len(meshes['housing'][0])]))

K, Rm, t = R.camera_from_h(R.H, R.REF_W, R.REF_H); eye = -Rm.T @ t
a = R.render(meshes, R.ref_cam_project(K, Rm, t), eye, R.REF_W, R.REF_H)
eye2 = np.array([cx-150, -170, 150.0])
b = R.render(meshes, look(eye2, [cx+25, 5, 10], 1700, 1000, 1086), eye2, 1000, 1086)
sheet = Image.new('RGB', (R.REF_W + 1000, R.REF_H), 'white'); sheet.paste(a, (0, 0)); sheet.paste(b, (R.REF_W, 0))
sheet.resize((sheet.width*2//3, sheet.height*2//3), Image.LANCZOS).save(f'assembled_{T:g}mm.png')
