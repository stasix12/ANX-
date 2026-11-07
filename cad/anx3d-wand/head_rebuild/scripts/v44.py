# v44 = v43 with the level-tick lines filled in and replaced by engraved arrows pointing at the track
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]
def L(f,dig=False):
    t=trimesh.load(f)
    if dig: t.merge_vertices(digits_vertex=4)
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
G=L(SRC); PAD=L('shW_add.stl',True)
R_PAD=22.6; Z1=-168.8; POS=[0,5.5,9.5,13.5,17.5]; SH_FL=10.6
def outside(r): return mf.Manifold.cylinder(400,60,60,128).translate([0,0,-350]) - mf.Manifold.cylinder(400,r,r,256).translate([0,0,-350])
fill=None; arrows=None
for i,p in enumerate(POS):
    zt=Z1+p; Lt=0.8+0.5*i
    for s in (1,-1):
        x0=SH_FL+1.4-0.1; x1=SH_FL+1.4+Lt+0.1
        b=mf.Manifold.cube([x1-x0,40,0.8]).translate([x0 if s>0 else -x1,0,zt-0.4])
        f=(b ^ PAD) - mf.Manifold.cylinder(400,R_PAD-0.6,R_PAD-0.6,256).translate([0,0,-350])
        fill=f if fill is None else fill+f
        # arrow: solid triangle, tip toward the track
        tip=11.95; base=13.75; hh=0.95
        tri=np.array([(tip,zt),(base,zt-hh),(base,zt+hh)]) if s>0 else np.array([(-tip,zt),(-base,zt+hh),(-base,zt-hh)])
        cs=mf.CrossSection([tri]); cs=cs if cs.area()>0 else mf.CrossSection([tri[::-1]]); a=cs.extrude(40).transform(np.array([[1,0,0,0],[0,0,-1,40],[0,1,0,0]],float))
        a=a ^ outside(R_PAD-0.45)
        arrows=a if arrows is None else arrows+a
P=(G+fill)-arrows
P=max(P.decompose(),key=lambda q:q.volume())
k=P.to_mesh(); t=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False)
print(P.status(),'watertight',t.is_watertight,'fill %.1f mm3, arrows %.1f mm3'%(fill.volume(),arrows.volume()))
t.export(OUT)
