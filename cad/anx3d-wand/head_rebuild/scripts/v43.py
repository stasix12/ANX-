# v42 = v41 + premium texture on the shutter-track frame (pad)
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]
t=trimesh.load(SRC)
G=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
R_PAD=22.6
def outside(r): return mf.Manifold.cylinder(400,60,60,128).translate([0,0,-350]) - mf.Manifold.cylinder(400,r,r,256).translate([0,0,-350])
cuts=None
def add(c):
    global cuts; cuts=c if cuts is None else cuts+c
# 1) engraved frame lines along both sides of the track + bottom bar (0.35 deep)
for s in (1,-1):
    add(mf.Manifold.cube([0.6,40,46.0]).translate([s*11.4-0.3,0,-196.7]) ^ outside(R_PAD-0.45))
add(mf.Manifold.cube([23.4,40,0.6]).translate([-11.7,0,-196.7]) ^ outside(R_PAD-0.45))
# 2) engraved "ANX SoftTouch" on both side strips (0.4 deep)
tx=trimesh.load('v41/text_softtouch.stl'); tx.merge_vertices()
TX=mf.Manifold(mf.Mesh(vert_properties=np.asarray(tx.vertices,np.float32),tri_verts=np.asarray(tx.faces,np.uint32)))
print('text manifold',TX.status(),'vol %.1f'%TX.volume())
add(TX ^ outside(R_PAD-0.4))
P=G-cuts
P=max(P.decompose(),key=lambda q:q.volume())
k=P.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False)
print(P.status(),'watertight',tt.is_watertight,'removed %.1f mm3'%(G.volume()-P.volume()))
tt.export(OUT)
