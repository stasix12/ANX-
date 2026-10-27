# חיבור מוט-ידית נעול נגד סיבוב: שיניים רדיאליות (Hirth) בין פני הגוף לאוגן של הידית,
# אום מושך את האוגן אל הגוף. צד הקרבון נשאר הידוק טבעת כמו במחבר הדק.
import numpy as np, trimesh
from manifold3d import Manifold, CrossSection
exec(open('build_slim.py').read().split("def save")[0])     # פרמטרים + half_body/ring/nut/thread של המחבר הדק

# צד הידית (z חיובי מהמרכז)
h_thr_len = 15.0;  h_face = 6.0 + h_thr_len          # הברגה 6..21, פנים ב-21
teeth_n, teeth_h, r_in, r_out = 24, 2.0, 19.5, 25.0
pilot_L, flange_t, flange_od = 20.0, 6.0, 49.5
sock_od, sock_L, lip_bore = 44.0, 40.0, 44.6        # בית לידית מאחורי האוגן; שפת אום הידית עוברת מעליו
n_plain = 11.0                                        # אום הידית: הברגה 15 + בית לאוגן ולמעבר 11 + שפה 6

def teeth(h, shrink=0.0, n=teeth_n):
    """שיניים רדיאליות: כל שן היא hull של 6 נקודות בקואורדינטות קוטביות (דפנות מישוריות רדיאליות).
    shrink: הקטנת גובה (מ"מ) תוך שמירת זווית הדופן -> מרווח אחיד על הדפנות."""
    th0 = np.pi / n
    hh = h - shrink; th = th0 * hh / h
    pts = []
    for r in (r_in, r_out):
        for sgn in (-1, 1):
            pts.append([r*np.cos(sgn*th), r*np.sin(sgn*th), 0.0])
        pts.append([r, 0.0, hh])
    tooth = Manifold.hull_points(pts)
    out = None
    for i in range(n):
        w = tooth.rotate([0, 0, 360*i/n])
        out = w if out is None else out + w
    return out

def keyed_body():
    carbon = half_body().rotate([180, 0, 0])                         # z מ-0 עד -37
    hs = cyl(54, 6) + thread(thr_major, h_thr_len).translate([0, 0, 6])
    hs += teeth(teeth_h).translate([0, 0, h_face])
    hs -= cyl(bore, h_face + 6).translate([0, 0, -1])                # קדח המוביל, פתוח עד המרכז
    body = carbon + hs
    stop = cyl(bore + 1, 2) - cyl(stop_d, 4).translate([0, 0, -1])    # טבעת עצירה עם מעבר אוויר 31
    body += stop.translate([0, 0, -1])
    body -= cyl(stop_d, 10).translate([0, 0, -5])                     # מוודא מעבר פתוח דרך המרכז
    body -= cyl(bore, (bore - stop_d)/2, d2=stop_d).translate([0, 0, -1 - (bore - stop_d)/2 + 0.01])  # פזה 45° מתחת לטבעת (הדפסה בלי תמיכות)
    return body

def handle_nut():
    L = nut_thr + n_plain + nut_lip
    outer = nut_outer(L)
    tl = nut_thr + 1
    hole = (cyl(thr_major - 2*depth + 2*thr_cl, tl + 1) + thread(thr_major, tl + 1, thr_cl)).translate([0, 0, -1])
    hole += cyl(thr_major + 2*thr_cl + 2, 2, d2=thr_major + 2*thr_cl - 2).translate([0, 0, -0.01])
    hole += cyl(flange_od + 1.0, n_plain + 1).translate([0, 0, nut_thr - 0.5])     # בית לאוגן
    hole += cyl(lip_bore, nut_lip + 2).translate([0, 0, nut_thr + n_plain - 0.01])
    hole += cyl(lip_bore, 1, d2=lip_bore + 2).translate([0, 0, L - 0.99])
    return outer - hole, L

def stub_adapter():
    """חלק נפרד: מוביל 38 לתוך הגוף + אוגן שיניים + בית 38.3 שהידית מודבקת לתוכו. ציר z: 0 = קצה המוביל."""
    f = cyl(38.0, pilot_L)
    f += cyl(flange_od, flange_t).translate([0, 0, pilot_L])
    f += teeth(teeth_h, 0.3).rotate([0, 0, 180/teeth_n]).rotate([180, 0, 0]).translate([0, 0, pilot_L])
    f += cyl(flange_od, (flange_od - sock_od)/2, d2=sock_od).translate([0, 0, pilot_L + flange_t])   # מעבר 45°
    f += cyl(sock_od, sock_L).translate([0, 0, pilot_L + flange_t])
    top = pilot_L + flange_t + sock_L
    c  = cyl(26.0, top + 2).translate([0, 0, -1])                                                     # מעבר אוויר
    c += cyl(26.0, (bore - 26.0)/2, d2=bore).translate([0, 0, top - sock_L - (bore - 26.0)/2])        # מדרגה 45°
    c += cyl(bore, sock_L + 1).translate([0, 0, top - sock_L])                                        # בית לידית
    c += cyl(bore + 1.5, 1.5, d2=bore).translate([0, 0, top - 1.49])
    return f - c

def flange_part():
    """מוביל 38 + אוגן עם שיניים, ציר z: 0 = קצה המוביל"""
    f = cyl(38.0, pilot_L)
    f += cyl(flange_od, flange_t).translate([0, 0, pilot_L])
    f += teeth(teeth_h, 0.3).rotate([0, 0, 180/teeth_n]).rotate([180, 0, 0]).translate([0, 0, pilot_L])  # שיניים כלפי המוביל, מוסטות חצי פסיעה
    return f

if __name__ == '__main__':
    B = keyed_body(); N, NL = handle_nut(); FL = flange_part()
    # הרכבה: קצה המוביל של הידית ב-z=1 (מעל המחיצה), האוגן יושב על פני הגוף
    z_fl = h_face + teeth_h - (pilot_L) + 0.0      # שורש שיני הידית = קצה שיני הגוף
    FLp = FL.translate([0, 0, z_fl])
    ov = (FLp ^ B).volume(); print('flange/body overlap mm3:', round(ov, 2), '(צריך ~0 = שיניים משולבות)')
    for ang in range(0, 360, 30):
        X = N.rotate([0, 0, ang]).translate([0, 0, 6]) ^ B
        Y = N.rotate([0, 0, ang]).translate([0, 0, 6]) ^ FLp
        print(ang, round(X.volume(), 1), round(Y.volume(), 1), end=' | ')
    print()
    for m, name in [(B, 'keyed_body'), (N, 'handle_nut'), (FL, 'flange_test')]:
        me = m.to_mesh(); t = trimesh.Trimesh(np.asarray(me.vert_properties)[:, :3], np.asarray(me.tri_verts), process=False)
        bb = m.bounding_box(); t.export(name + '.obj'); print(name, m.status(), 'z %.1f..%.1f' % (bb[2], bb[5]))
