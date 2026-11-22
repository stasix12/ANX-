# Window seat ledge 50 % narrower: the opening grows to 2.5 mm inside the pocket wall (ledge ~5 -> 2.5 mm wide).
import sys,numpy as np,pickle,trimesh,manifold3d as mf
SRC,OUT,WD=sys.argv[1],sys.argv[2],sys.argv[3]          # WD = rec/win or rec/winN (seat frame + outlines)
T=np.load(WD+'/T_seat.npy'); Ti=np.linalg.inv(T); O=pickle.load(open(WD+'/outlines.pkl','rb'))
CS=lambda p: mf.CrossSection([p if 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])>0 else p[::-1]])
W=CS(O[0.5])^CS(O[1.0])^CS(O[2.0]); OPEN=CS(O[-0.7]); NEW=W.offset(-2.5,mf.JoinType.Round)
print('old opening area %.0f, new %.0f mm2 | old opening inside new: %.3f mm2 outside'%(OPEN.area(),NEW.area(),(OPEN-NEW).area()))
t=trimesh.load(SRC); t=t.to_geometry() if hasattr(t,'to_geometry') else t
H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))).transform(T[:3,:])
ring=NEW-OPEN.offset(-0.05,mf.JoinType.Round)
cut=ring.extrude(1.62).translate([0,0,-1.6])                    # through the 1.5 mm ledge only (h -1.6 .. +0.02)
rem=H^cut; print('removed %.1f mm3 (ring %.0f mm2 x 1.5 mm = %.0f)'%(rem.volume(),ring.area(),ring.area()*1.5))
N=(H-cut).transform(Ti[:3,:]); parts=sorted(N.decompose(),key=lambda q:-q.volume()); N=parts[0]
print('bodies %d dropped %.4f | status %s'%(len(parts),sum(p.volume() for p in parts[1:]),N.status()))
k=N.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(OUT)
