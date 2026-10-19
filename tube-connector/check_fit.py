import sys; sys.argv=['x']
exec(open('build_threaded.py').read().split("a = save")[0])
A, B = part_A(), part_B()
print('B status', B.status(), 'genus', B.genus())
top = TOP + thr_len + 1 + pilot_L + 2
best=None
for ang in range(0, 360, 15):   # any phase: female must accept male at shoulder contact for the right phase
    Am = A.rotate([180,0,ang]).translate([0,0,TOP+top])
    v = (Am ^ B).volume()
    best = min(best or 1e9, v)
    print(ang, round(v,2))
