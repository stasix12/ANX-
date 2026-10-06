import trimesh, numpy as np
from trimesh.creation import cylinder, box
S=128
def cyl_x(r,h,x0=0):
    c=cylinder(radius=r,height=h,sections=S); c.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0])); c.apply_translation([x0,0,0]); return c
def bx(x0,x1,y0,y1,z0,z1):
    b=box(extents=[x1-x0,y1-y0,z1-z0]); b.apply_translation([(x0+x1)/2,(y0+y1)/2,(z0+z1)/2]); return b
# Rods: D40 x L250
rod=cylinder(radius=20,height=250,sections=S); rod.apply_translation([0,0,125])
rod.export('rod_D40_L250.stl')
# Clamp coupling: OD60, bore 40.4, L100, split + 4x M5 bolts
L=100
body=trimesh.boolean.union([cyl_x(30,L), bx(-L/2,L/2,18,44,-13,13)])
cuts=[cyl_x(20.2,L+2),
      bx(-L/2-1,L/2+1,0,50,-1.5,1.5),          # longitudinal slot
      bx(-1,1,19,50,-20,20)]                    # relief: each side clamps independently
for x in (-35,-15,15,35):
    h=cylinder(radius=2.8,height=40,sections=48); h.apply_translation([x,34,0]); cuts.append(h)   # M5 clearance
    for s in (1,-1):                            # counterbore (head) / nut pocket
        p=cylinder(radius=5.2 if s>0 else 4.8,height=10,sections=6 if s<0 else 48); p.apply_translation([x,34,s*(9+5)]); cuts.append(p)
coupler=trimesh.boolean.difference([body]+cuts)
coupler.apply_transform(trimesh.transformations.rotation_matrix(-np.pi/2,[0,1,0]))  # axis -> Z for printing
coupler.apply_translation(-coupler.bounds[0]*[0,0,1])
coupler.export('clamp_coupler_D40.stl')
for n in ('rod_D40_L250.stl','clamp_coupler_D40.stl'):
    m=trimesh.load(n); print(n, m.is_watertight, np.round(m.extents,1), len(m.faces))
