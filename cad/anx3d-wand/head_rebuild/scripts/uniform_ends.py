# Uniform mouth: extend the middle and lower lip profiles (taken at x=30) out to the side walls on both ends,
# filling the side grooves next to the slot ends. Only adds material; stays inside the head's outer hull.
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]
t=trimesh.load(SRC); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
YF=float(np.asarray(t.vertices)[:,1].min())
S=np.array([[0,1,0,0],[0,0,1,0],[1,0,0,0]],float)          # (x,y,z)->(y,z,x): slice at x gives (y,z)
Sinv=np.array([[0,0,1,0],[1,0,0,0],[0,1,0,0]],float)       # (y,z,x)->(x,y,z)
ref=H.transform(S).slice(30.0)                               # uniform lip profile
win=mf.CrossSection.square([YF+74.0-YF+0.0+8.7,25.0]).translate([YF-0.1,-296.0])   # y YF-0.1..-74 , z -296..-271
win=mf.CrossSection.square([(-74.0)-(YF-0.1),25.0]).translate([YF-0.1,-296.0])
prof=ref^win
ext=None
for x0,x1 in ((44.0,58.0),(-58.0,-44.0)):
    e=prof.extrude(x1-x0).translate([0,0,x0]).transform(Sinv); ext=e if ext is None else ext+e
tip=mf.Manifold.cube([120,26,60]).translate([-60,YF-0.01,-298])
hull=(H^tip).hull()
add=(ext^hull)-H
N=H+add; parts=sorted(N.decompose(),key=lambda q:-q.volume()); N=parts[0]
print('dropped fragments %.4f mm3'%sum(p.volume() for p in parts[1:]))
print('added %.1f mm3 (left %.1f, right %.1f) | bodies %d | status %s'%(add.volume(),(add^mf.Manifold.cube([60,400,400]).translate([-60,-200,-400])).volume(),(add^mf.Manifold.cube([60,400,400]).translate([0,-200,-400])).volume(),len(parts),N.status()))
bb=np.round(add.bounding_box(),2); print('added region x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f'%(bb[0],bb[3],bb[1],bb[4],bb[2],bb[5]))
k=N.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(OUT)
