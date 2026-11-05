# Works on the handle exactly as exported for printing (ring end on the bed at z=0).
# Finds the ring axis from the mesh, then rounds the ring's bottom outer edge (towards the head). Thread untouched.
import sys,numpy as np,trimesh,manifold3d as mf
IN,OUT=sys.argv[1],sys.argv[2]; RB=float(sys.argv[3]) if len(sys.argv)>3 else 22.6; HT=float(sys.argv[4]) if len(sys.argv)>4 else 8.0
s=trimesh.load(IN); t=s.to_geometry() if isinstance(s,trimesh.Scene) else s
z0=t.bounds[0][2]
M0=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
pts=np.vstack([np.asarray(p) for p in M0.slice(z0+5.0).to_polygons()])
RO=(pts[:,0].max()-pts[:,0].min())/2; cx=(pts[:,0].max()+pts[:,0].min())/2; cy=pts[:,1].max()-RO; c=np.array([cx,cy])
r=np.hypot(pts[:,0]-cx,pts[:,1]-cy); print('check: max r %.2f, slice points beyond RO+0.05: %d'%(r.max(),int((r>RO+0.05).sum())))
print('ring axis at x=%.2f y=%.2f, outer radius %.2f, bed z %.2f'%(c[0],c[1],RO,z0))
M=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
print('input status',M.status(),'volume %.0f'%M.volume())
ss=np.linspace(0,1,60); zs=z0+ss*HT; rs=RB+(RO-RB)*np.sqrt(np.clip(ss*(2-ss),0,1))
prof=[(60,z0-1),(RB,z0-1)]+list(zip(rs,zs))+[(RO+0.05,z0+HT+0.01),(60,z0+HT+0.01)]
P_=np.array(prof)
if 0.5*np.sum(P_[:,0]*np.roll(P_[:,1],-1)-np.roll(P_[:,0],-1)*P_[:,1])<0: P_=P_[::-1]
remove=mf.CrossSection([P_]).revolve(512)
remove=remove.translate([c[0],c[1],0]); print('remove solid volume %.0f'%remove.volume())
N=M-remove; N=max(N.decompose(),key=lambda q:q.volume())
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(np.float64),np.asarray(k.tri_verts),process=False)
print('out watertight',tt.is_watertight,'removed %.0f mm3'%(M.volume()-N.volume()))
sc=trimesh.Scene(); sc.add_geometry(tt,node_name='ANX3D_v59_HANDLE',geom_name='ANX3D_v59_HANDLE'); sc.export(OUT)
