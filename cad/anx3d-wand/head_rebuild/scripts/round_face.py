# Round every edge of the mouth contact face (plane y = YF) with radius R: glide lips, no sharp edges on the fabric.
# Layered along y: each 0.05 mm slice of the tip is inset by the circular fillet profile.
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]; R=float(sys.argv[3]) if len(sys.argv)>3 else 2.0; DY=0.05
t=trimesh.load(SRC); M=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
YF=float(np.asarray(t.vertices)[:,1].min())
S=np.array([[1,0,0,0],[0,0,1,0],[0,1,0,0]],float)          # swap y<->z (its own inverse)
M2=M.transform(S)                                           # now the face is the plane z2 = YF
layers=None
n=int(round(R/DY))
for i in range(n):
    d=(i+0.5)*DY; inset=R-np.sqrt(max(R*R-(R-d)**2,0.0))
    cs=M2.slice(YF+d)
    if inset>1e-4: cs=cs.offset(-inset,mf.JoinType.Round,circular_segments=64)
    L=cs.extrude(DY+0.002).translate([0,0,YF+i*DY-0.001])
    layers=L if layers is None else layers+L
slab=mf.Manifold.cube([400,800,R+5]).translate([-200,-600,YF-5])   # z2 from YF-5 to YF+R
N=(M2-slab)+layers
N=N.transform(S); parts=sorted(N.decompose(),key=lambda q:-q.volume()); N=parts[0]
print('face y=%.3f R=%.1f | bodies %d (dropped %.3f) | vol %.0f -> %.0f (removed %.1f mm3) | status %s'%(YF,R,len(parts),sum(p.volume() for p in parts[1:]),M.volume(),N.volume(),M.volume()-N.volume(),N.status()))
k=N.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(OUT)
