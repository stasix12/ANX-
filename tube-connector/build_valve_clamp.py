# תופסן דו-חלקי על צינור 38 עם אוזן אנכית לשסתום ההתזה.
# שני חורי M4 באוזן, 21 מ"מ ביניהם באלכסון 45° - כמו בקובץ ANX3D_sofa-tool (חורים 4.5 עם שקע 8).
import numpy as np, trimesh
from manifold3d import Manifold
F = 128
tube_d, cl = 38.0, 0.3
bore = tube_d + cl; od = 50.0; L = 32.0              # ציר הצינור = z
lug_w, lug_h = 12.0, 14.0                            # אוזני ברגי ההידוק (M5) בשני הצדדים, מישור החלוקה y=0
bolt_d, head_d, nut_af = 5.4, 9.5, 8.2               # M5: קדח, ראש, אום (across flats)
plate_t, plate_h, plate_w = 6.0, 48.0, 36.0          # האוזן לשסתום: עובי, גובה מעל ציר הצינור, רוחב (לאורך z)
hole_d, hole_cb = 4.4, 8.0                           # M4 דרך + שקע לראש מצד הצינור
pitch = 21.0; dx = dy = pitch/np.sqrt(2)             # 14.85 x 14.85

cyl = lambda d, h, n=F, d2=None: Manifold.cylinder(h, d/2, (d2 if d2 else d)/2, n)
box = lambda x, y, z: Manifold.cube([x, y, z])

def ring_half(top):
    r = cyl(od, L) - cyl(bore, L+2).translate([0,0,-1])
    r += box(2*(od/2+lug_w), lug_h, L).translate([-(od/2+lug_w), -lug_h/2, 0])      # רצועת האוזניים
    r -= cyl(bore, L+2).translate([0,0,-1])
    keep = box(200, 100, L+2).translate([-100, 0 if top else -100, -1])
    r = r ^ keep
    for sx in (-1, 1):   # ברגי הידוק לאורך y
        x = sx*(od/2 + lug_w/2)
        r -= cyl(bolt_d, 100, 32).rotate([-90,0,0]).translate([x, -50, L/2])
        if top: r -= cyl(head_d, 20, 32).rotate([-90,0,0]).translate([x, lug_h/2 - 4, L/2])          # שקע ראש
        else:   r -= cyl(nut_af/np.cos(np.pi/6), 20, 6).rotate([-90,0,0]).translate([x, -lug_h/2 - 16, L/2])  # מלכודת אום
    return r

def top_half():
    r = ring_half(True)
    y0 = od/2 - 2
    p = box(plate_t, plate_h - y0, plate_w).translate([-plate_t/2, y0, (L - plate_w)/2])
    p += box(plate_t, 2, plate_w).translate([-plate_t/2, y0, (L-plate_w)/2])   # חפיפה לטבעת
    # פזות/תמיכה: כתפיים 45° משני צידי הבסיס של הפלטה
    for s in (-1, 1):
        p += box(6, 6, plate_w).rotate([0,0,45]).translate([s*plate_t/2 - (0 if s>0 else 0), y0+1.5, (L-plate_w)/2]) ^ box(20, 8, plate_w).translate([-10, y0, (L-plate_w)/2])
    r += p
    r -= cyl(bore, L+2).translate([0,0,-1])
    zc, yc = L/2, y0 + 2 + (plate_h - y0 - 2)/2
    for sz, sy in ((-1, -1), (1, 1)):   # שני החורים באלכסון
        z, y = zc + sz*dx/2, yc + sy*dy/2
        r -= cyl(hole_d, 20, 32).rotate([0,90,0]).translate([-10, y, z])
        r -= cyl(hole_cb, 10, 32).rotate([0,90,0]).translate([-plate_t/2 - 10 + 2.5, y, z])   # שקע לראש מצד הצינור (עומק 2.5)
    return r

T, B = top_half(), ring_half(False)
for m, name in [(T, 'valve_clamp_top.stl'), (B, 'valve_clamp_bottom.stl')]:
    me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False); t.export(name)
    bb = m.bounding_box(); print(name, m.status(), 'size %.0f x %.0f x %.0f' % (bb[3]-bb[0], bb[4]-bb[1], bb[5]-bb[2]))
