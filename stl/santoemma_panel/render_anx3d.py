"""Renders the ANX3D panel (z-buffer rasteriser, no OpenGL) next to the reference:
   anx3d_preview.png  - same camera as the reference photo (recovered from its perspective) + straight-on front view
   anx3d_compare.png  - reference | render, both views
Run:  python3 render_anx3d.py [reference.png]"""
import sys, numpy as np
from PIL import Image, ImageFilter
import cadquery as cq
from make_anx3d_panel import (build, PW, PH, T, RIM_H, SWITCHES, BIG, SMALL, CABLE, SCREWS_BLACK, SCREW_BLUE, HEAD_DEPTH,
                              FLANGE_PITCH, plate_outline, prism, cyl, rbox)

REF = sys.argv[1] if len(sys.argv) > 1 else None
# reference camera: homography plate-mm -> reference px, fitted on the 4 corner screws, plate plane at z = 5.5
H = np.array([[ 3.66391413e+00,  2.29320794e+00,  7.49389819e+02],
              [ 1.46511480e+00, -2.69009860e+00,  4.60429388e+02],
              [-5.44858741e-04,  6.49244983e-04,  1.00000000e+00]])
REF_W, REF_H, PLANE_Z = 1448, 1086, 5.5

def camera_from_h(H, w, h):               # K [r1 r2 t] = H (Zhang, principal point at the centre, square pixels)
    cx, cy = w/2, h/2
    h1, h2 = H[:, 0], H[:, 1]
    f = np.sqrt(-((h1[0]-cx*h1[2])*(h2[0]-cx*h2[2]) + (h1[1]-cy*h1[2])*(h2[1]-cy*h2[2])) / (h1[2]*h2[2]))
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]])
    B = np.linalg.inv(K) @ H
    lam = 1/np.linalg.norm(B[:, 0])
    r1, r2, t = lam*B[:, 0], lam*B[:, 1], lam*B[:, 2]
    R = np.stack([r1, r2, np.cross(r1, r2)], 1)
    U, _, Vt = np.linalg.svd(R); R = U @ Vt
    return K, R, t - R[:, 2]*PLANE_Z

def props():                             # render-only hardware: machine housing, rocker switches, screws (not printed)
    hx, hy, hd = BIG; sx, sy, sd = SMALL
    housing = prism(plate_outline().buffer(-1.5), -30, -0.01).cut(cyl(hd, -31, 1, hx, hy)).cut(cyl(sd, -31, 1, sx, sy))
    bezel = rocker = None
    for x, y in SWITCHES:
        b = rbox(30.5, 38.0, 2.0, 2.0, T+3.5, x, y)
        r = rbox(25.0, 32.0, 2.5, T+3.5, T+9.0, x, y).edges('>Z').chamfer(1.2)
        bezel = b if bezel is None else bezel.union(b); rocker = r if rocker is None else rocker.union(r)
    def screw(x, y, z, d):
        hexs = cq.Workplane('XY', origin=(x, y, z+0.45*d-0.8)).polygon(6, 0.35*d).extrude(2)
        return cq.Workplane('XY', origin=(x, y, z)).circle(d/2).extrude(0.45*d).faces('>Z').edges().fillet(0.18*d).cut(hexs)
    heads = [screw(x, y, T-HEAD_DEPTH, 7.4) for x, y in SCREWS_BLACK] + [screw(*SCREW_BLUE, T+RIM_H-HEAD_DEPTH, 7.4)]
    black = [screw(hx+a*FLANGE_PITCH/2, hy+b*FLANGE_PITCH/2, T+0.3, 5.4) for a in (-1, 1) for b in (-1, 1)]
    for hh in black: bezel = bezel.union(hh)                            # black M3 screws on the flange
    chrome = heads[0]
    for hh in heads[1:]: chrome = chrome.union(hh)
    return {'housing': housing, 'bezel': bezel, 'rocker': rocker, 'chrome': chrome}

def tess(shape, tol=0.03):
    v, f = shape.val().tessellate(tol, 0.15)
    return np.array([(p.x, p.y, p.z) for p in v]), np.array(f)

MAT = {'black': 0, 'blue': 1, 'silver': 2, 'housing': 3, 'bezel': 4, 'rocker': 5, 'chrome': 6}

def raster(meshes, project, w, h):
    zb = np.full((h, w), np.inf); nb = np.zeros((h, w, 3)); mb = np.full((h, w), -1); pb = np.zeros((h, w, 3))
    for name, (V, F) in meshes.items():
        P, Z = project(V)
        tri = V[F]; n = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0]); n /= np.linalg.norm(n, axis=1)[:, None]+1e-12
        for k, (a, b, c) in enumerate(F):
            xs, ys = P[[a, b, c], 0], P[[a, b, c], 1]
            x0, x1 = max(int(xs.min()), 0), min(int(xs.max())+1, w-1)
            y0, y1 = max(int(ys.min()), 0), min(int(ys.max())+1, h-1)
            if x0 > x1 or y0 > y1: continue
            gx, gy = np.meshgrid(np.arange(x0, x1+1)+0.5, np.arange(y0, y1+1)+0.5)
            d = (ys[1]-ys[2])*(xs[0]-xs[2]) + (xs[2]-xs[1])*(ys[0]-ys[2])
            if abs(d) < 1e-9: continue
            l0 = ((ys[1]-ys[2])*(gx-xs[2]) + (xs[2]-xs[1])*(gy-ys[2]))/d
            l1 = ((ys[2]-ys[0])*(gx-xs[2]) + (xs[0]-xs[2])*(gy-ys[2]))/d
            l2 = 1-l0-l1
            ins = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
            if not ins.any(): continue
            z = l0*Z[a] + l1*Z[b] + l2*Z[c]
            sub = zb[y0:y1+1, x0:x1+1]
            m = ins & (z < sub)
            if not m.any(): continue
            sub[m] = z[m]
            nb[y0:y1+1, x0:x1+1][m] = n[k]; mb[y0:y1+1, x0:x1+1][m] = MAT[name]
            pb[y0:y1+1, x0:x1+1][m] = (l0[..., None]*V[a] + l1[..., None]*V[b] + l2[..., None]*V[c])[m]
    return zb, nb, mb, pb

BASE = {0: (0.075, 0.075, 0.08), 1: (0.02, 0.12, 0.72), 2: (0.80, 0.81, 0.83), 3: (0.035, 0.035, 0.04),
        4: (0.025, 0.025, 0.03), 5: (0.80, 0.88, 1.0), 6: (0.70, 0.71, 0.73)}

def shade(nb, mb, pb, eye, w, h, bg):
    rng = np.random.default_rng(1)
    v = eye[None, None, :] - pb; v /= np.linalg.norm(v, axis=2, keepdims=True)+1e-9
    lights = [(np.array([-0.45, 0.55, 0.70]), 1.0), (np.array([0.6, 0.2, 0.75]), 0.45)]
    img = bg.copy()
    grain = np.asarray(Image.fromarray((rng.random((h, w))*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))/255.0
    streak = np.repeat(rng.random((h, 1)), w, 1)                       # brushed lines
    out = np.zeros((h, w, 3))
    for mid, col in BASE.items():
        m = mb == mid
        if not m.any(): continue
        col = np.array(col)[None]
        nn, vv = nb[m], v[m]
        nz = nn[:, 2]
        diff = np.zeros(len(nn)); nh = []
        for L, I in lights:
            L = L/np.linalg.norm(L)
            diff += I*np.clip(nn @ L, 0, 1)
            hv = vv + L; hv /= np.linalg.norm(hv, axis=1, keepdims=True)
            nh.append((I, np.clip(np.sum(nn*hv, 1), 0, 1)))
        class Spec:                                                     # Spec()**p = sum of per-light Blinn lobes
            def __pow__(self, p): return sum(I*x**p for I, x in nh)[:, None]
        bevel = np.clip((0.985-nz)*4, 0, 1)                             # chamfers / side walls
        facing = np.clip(nn @ (np.array([-0.45, 0.55, 0.3])/0.77), 0, 1)
        d, s_ = diff[:, None], Spec()
        if mid == 0:
            g = (0.8 + 0.45*grain[m])[:, None]
            c = col*(0.45+0.8*d)*g + 0.10*s_**20 + (bevel*facing)[:, None]*0.35
        elif mid == 1:
            top = col*(0.55+0.55*d)*(0.85+0.25*grain[m])[:, None]
            edge = np.array([[0.20, 0.50, 1.0]])*(0.35+0.9*facing[:, None])
            c = top*(1-bevel[:, None]) + edge*bevel[:, None] + s_**40*np.array([[0.5, 0.7, 1.0]])*0.9
        elif mid == 2:
            br = (0.80 + 0.22*streak[m])[:, None]
            c = col*(0.50+0.55*d)*br + 0.6*s_**30 - (bevel*(1-facing))[:, None]*0.35
        elif mid == 5:                                                  # lit rocker under a clear cap
            c = col*(0.85+0.15*d) * (1-bevel[:, None]) + np.array([[0.15, 0.35, 1.0]])*bevel[:, None] + 0.3*s_**30
        elif mid == 6:                                                  # chrome screw heads
            env = 0.35 + 0.65*np.clip(nn[:, 1]*0.6+0.5, 0, 1)
            c = col*env[:, None]*(0.5+0.5*d) + 1.0*s_**25
        else:
            c = col*(0.5+0.8*d) + 0.25*s_**30 + (bevel*facing)[:, None]*0.12
        out[m] = c
    img[mb >= 0] = np.clip(out[mb >= 0], 0, 1)
    return img

def render(meshes, project, eye, w, h, ss=2):
    W, Hh = w*ss, h*ss
    zb, nb, mb, pb = raster(meshes, lambda V: project(V, ss), W, Hh)
    yy = np.linspace(0, 1, Hh)[:, None, None]
    bg = np.ones((Hh, W, 3))*(0.93 - 0.08*yy)*np.array([1.0, 0.98, 0.96])
    img = shade(nb, mb, pb, eye, W, Hh, bg)
    return Image.fromarray((img*255).astype(np.uint8)).resize((w, h), Image.LANCZOS)

def ref_cam_project(K, R, t):
    def project(V, ss):
        c = V @ R.T + t
        p = c @ K.T
        return p[:, :2]/p[:, 2:3]*ss, c[:, 2]
    return project

def ortho_project(scale, w, h):           # straight-on front view, mm -> px
    def project(V, ss):
        return np.stack([(V[:, 0]+PW/2+10)*scale*ss, (PH/2+10-V[:, 1])*scale*ss], 1), -V[:, 2]
    return project

if __name__ == '__main__':
    parts = build()
    meshes = {k: tess(s) for k, s in list(parts.items()) + list(props().items())}
    K, R, t = camera_from_h(H, REF_W, REF_H)
    eye = -R.T @ t
    persp = render(meshes, ref_cam_project(K, R, t), eye, REF_W, REF_H)
    S = 4
    ow, oh = int((PW+20)*S), int((PH+20)*S)
    front = render(meshes, ortho_project(S, ow, oh), np.array([0, 0, 2000.0]), ow, oh)
    sheet = Image.new('RGB', (REF_W + ow, max(REF_H, oh)), 'white')
    sheet.paste(persp, (0, 0)); sheet.paste(front, (REF_W, (REF_H-oh)//2))
    sheet.resize((sheet.width*2//3, sheet.height*2//3), Image.LANCZOS).save('anx3d_preview.png')
    if REF:
        ref = Image.open(REF).convert('RGB').resize((REF_W, REF_H))
        cmp_ = Image.new('RGB', (REF_W*2, REF_H), 'white'); cmp_.paste(ref, (0, 0)); cmp_.paste(persp, (REF_W, 0))
        cmp_.resize((REF_W, REF_H//2), Image.LANCZOS).save('anx3d_compare.png')
        # rectified reference: plate mm -> reference px through H, reference layout scaled to 258 x 175 (SX, SY)
        from make_anx3d_panel import SX, SY
        a = np.asarray(ref)
        gx, gy = np.meshgrid((np.arange(ow)+0.5)/S-PW/2-10, PH/2+10-(np.arange(oh)+0.5)/S)
        P = np.stack([gx/SX, gy/SY, np.ones_like(gx)], -1) @ H.T
        u = np.clip((P[..., 0]/P[..., 2]).astype(int), 0, REF_W-1); v = np.clip((P[..., 1]/P[..., 2]).astype(int), 0, REF_H-1)
        rect = Image.fromarray(a[v, u])
        both = Image.new('RGB', (ow*2+20, oh), 'white'); both.paste(rect, (0, 0)); both.paste(front, (ow+20, 0))
        both.resize((both.width//2, both.height//2), Image.LANCZOS).save('anx3d_compare_front.png')
    print('focal', round(K[0, 0]), 'eye', eye.round(1))
