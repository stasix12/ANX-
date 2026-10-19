# ידית מכופפת מודפסת למוט 38 מ"מ.
# צד אחד: זיז 38 מ"מ שנכנס למחבר הטבעת הקיים (ferrule). צד שני: אחיזה ישרה בזווית.
# הרצה: python3 build_handle.py -> handle.stl
import numpy as np, trimesh
from manifold3d import Manifold

F = 96
od, wall   = 38.0, 4.0        # קוטר חיצוני ועובי דופן (מעבר אוויר 30 מ"מ)
stub_L     = 70.0             # הזיז שנכנס למחבר
angle_deg  = 40.0             # זווית הכיפוף
bend_R     = 90.0             # רדיוס הכיפוף (למרכז הצינור)
grip_L     = 230.0            # אורך האחיזה
grip_od    = 38.0             # קוטר האחיזה (לקלמרה של הטריגר)
cap        = 0.0              # פתוח משני הצדדים - צינור שאיבה
N_BEND     = 14

def disk(d, z=0.0):
    return Manifold.cylinder(0.01, d/2, d/2, F).translate([0,0,z])

def place(m, p, t):
    """מעביר גוף שנבנה סביב ציר z לנקודה p עם כיוון t (יחידה)."""
    t = np.asarray(t, float); t /= np.linalg.norm(t)
    ang = np.degrees(np.arctan2(t[0], t[2]))          # סיבוב סביב y: z -> כיוון t במישור xz
    return m.rotate([0, ang, 0]).translate(list(p))

def sweep(d, pts, dirs):
    """צינור מלא בקוטר d לאורך נקודות/כיוונים (hull בין דיסקים עוקבים)."""
    disks = [place(disk(d), p, t) for p, t in zip(pts, dirs)]
    out = None
    for a, b in zip(disks[:-1], disks[1:]):
        h = Manifold.hull(a + b) if hasattr(Manifold, 'hull') else (a + b).hull()
        out = h if out is None else out + h
    return out

# מסלול: זיז לאורך z, כיפוף במישור xz, אחיזה ישרה
a = np.radians(angle_deg)
pts, dirs = [], []
pts += [np.array([0,0,0.]), np.array([0,0,stub_L])]; dirs += [[0,0,1],[0,0,1]]
c = np.array([bend_R, 0, stub_L])                     # מרכז הקשת
for i in range(1, N_BEND+1):
    th = a*i/N_BEND
    pts.append(c + bend_R*np.array([-np.cos(th), 0, np.sin(th)]))
    dirs.append([np.sin(th), 0, np.cos(th)])
end_dir = np.array([np.sin(a), 0, np.cos(a)])
pts.append(pts[-1] + grip_L*end_dir); dirs.append(end_dir)

outer = sweep(od, pts, dirs)
# אחיזה בקוטר אחר (אם שונה): מחליפים את הקטע האחרון
if grip_od != od:
    outer += sweep(grip_od, pts[-2:], dirs[-2:])
inner_pts = [pts[0] - np.array([0,0,1.0])] + pts[1:-1] + [pts[-1] + 1.0*end_dir]
inner = sweep(od - 2*wall, inner_pts, dirs)
handle = outer - inner
# פזה בקצה הזיז
handle -= Manifold.cylinder(1.5, od/2+1, od/2-1.5, F).translate([0,0,-0.01]) - Manifold.cylinder(2, od/2-1.5, od/2-1.5, F).translate([0,0,-0.5])

me = handle.to_mesh(); t = trimesh.Trimesh(me.vert_properties[:,:3], me.tri_verts); t.export('handle.stl')
print('status', handle.status(), 'bounds', np.round(t.bounds,1).tolist(), round(t.volume/1000,1), 'cm3')
