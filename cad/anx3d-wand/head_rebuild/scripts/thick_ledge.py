# Thicken the window seat ledge from 1.5 to 2.2 mm (+47 %) by adding material underneath (seat height unchanged).
# Long sides + top end only; the bottom end (above the air passage into the slot) is left as it is.
import sys,numpy as np,pickle,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]; T=np.load('rec/win/T_seat.npy'); Ti=np.linalg.inv(T)
O=pickle.load(open('rec/win/outlines.pkl','rb'))
CS=lambda p: mf.CrossSection([p if 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])>0 else p[::-1]])
t=trimesh.load(SRC); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
Hs=H.transform(T[:3,:])
OPEN=CS(O[-0.7]); WALL=CS(O[1.0])
band=(WALL.offset(2.2,mf.JoinType.Round)-OPEN)^mf.CrossSection.square([200,45+60]).translate([-100,-60])   # e2 < 45
shelf=Hs.slice(-0.75)^band                                    # the ledge ring (merges into the walls further out)
add=shelf.extrude(0.75).translate([0,0,-2.2])                 # h -2.2 .. -1.45 (under the ledge only)
newm=add-Hs
print('ledge ring area %.0f mm2 | new material %.1f mm3'%(shelf.area(),newm.volume()))
N=(Hs+add).transform(Ti[:3,:]); parts=sorted(N.decompose(),key=lambda q:-q.volume()); N=parts[0]
print('bodies %d dropped %.4f | vol %.0f -> %.0f | status %s'%(len(parts),sum(p.volume() for p in parts[1:]),H.volume(),N.volume(),N.status()))
k=N.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(OUT)
