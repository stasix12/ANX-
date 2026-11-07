# insert a 22 mm plain segment between the full grip and the collar, so the thread no longer eats the grip
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]; ZS=-145.0; L=22.0
t=trimesh.load(SRC); G=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
def slab(z0,z1): return mf.Manifold.cube([300,300,z1-z0]).translate([-150,-150,z0])
cs=mf.CrossSection([np.asarray(p) for p in G.slice(-144.0).to_polygons()])
filler=cs.extrude(L+0.2).translate([0,0,ZS-0.1])
N=(G^slab(-400,ZS)) + filler + (G^slab(ZS,400)).translate([0,0,L])
N=max(N.decompose(),key=lambda q:q.volume())
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False)
print(N.status(),'watertight',tt.is_watertight,'z',np.round(N.bounding_box(),1)[2::3]); tt.export(OUT)
