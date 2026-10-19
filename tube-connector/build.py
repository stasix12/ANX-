import numpy as np, trimesh
from manifold3d import Manifold, Mesh
F=128
tube_d,cl,wall,L=38,0.3,5,160
stop_w,stop_d,slit,bridge=2,31,2,6
bolt_d,head_d,nut_d,ear_w,ear_x=5.5,10,9.4,18,36
id_=tube_d+cl; od=id_+2*wall; bolt_x=od/2+5.5
cyl=lambda d,h,n=F,d2=None: Manifold.cylinder(h,d/2,(d2 if d2 else d)/2,n)
box=lambda x,y,z: Manifold.cube([x,y,z])
body=cyl(od,L)+box(ear_x-id_/2+4,ear_w,L).translate([id_/2-4,-ear_w/2,0])
stop=(cyl(id_+1,stop_w)-cyl(stop_d,stop_w+2).translate([0,0,-1])).translate([0,0,L/2-stop_w/2])
cut=cyl(id_,L+2).translate([0,0,-1])-stop
cut+=cyl(id_+1.5,1.5,d2=id_).translate([0,0,-0.01])+cyl(id_,1.5,d2=id_+1.5).translate([0,0,L-1.49])
for z0 in (-1,L/2+bridge/2): cut+=box(ear_x+1,slit,L/2-bridge/2+1).translate([0,-slit/2,z0])
for z in (20,58,L-58,L-20):
    b=cyl(bolt_d,2*ear_w,32).translate([0,0,-ear_w])+cyl(head_d,ear_w,32).translate([0,0,5])+cyl(nut_d,ear_w,6).translate([0,0,-5-ear_w])
    cut+=b.rotate([-90,0,0]).translate([bolt_x,0,z])
m=(body-cut).to_mesh()
t=trimesh.Trimesh(m.vert_properties[:,:3],m.tri_verts)
t.export('connector.stl'); print(t.is_watertight, t.bounds, round(t.volume/1000,1),'cm3')
