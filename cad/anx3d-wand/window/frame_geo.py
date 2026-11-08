import numpy as np,trimesh,manifold3d as mf
s=1/np.sqrt(2)
t=trimesh.load('../in64/out_HEAD_colour-1.stl')
# 1) fit the seat plane: shelf-top faces, normal ~ seat normal, around the window
n_guess=np.array([0,s*(1-0.0705),-s*(1+0.0705)]); n_guess/=np.linalg.norm(n_guess)
c=t.triangles_center; nrm=t.face_normals; a=t.area_faces
p0=np.array([0,-41.6,-235.0]); t_ax=np.array([0,s,s]); n_ax=np.array([0,s,-s])
U=c[:,0]; V=(c-p0)@t_ax; Hh=(c-p0)@n_ax
seat_h=13.09+0.0705*V
k=(nrm@n_guess>np.cos(np.radians(2)))&(np.abs(Hh-seat_h)<0.3)&(V>-55)&(V<35)
P=c[k]; w=a[k]; print('seat faces',k.sum(),'area %.0f mm2'%w.sum())
cen=(P*w[:,None]).sum(0)/w.sum(); Q=(P-cen)*np.sqrt(w)[:,None]
_,_,vt=np.linalg.svd(Q,full_matrices=False); ns=vt[2]; ns=ns if ns@n_guess>0 else -ns
res=(P-cen)@ns; print('seat plane normal',np.round(ns,5),'tilt vs window-plane normal %.2f deg'%np.degrees(np.arccos(ns@n_ax)),'flatness max %.3f mm'%np.abs(res).max())
# seat frame: e1 = x, e3 = ns, e2 = e3 x e1 ; origin = window centre on the seat plane
e1=np.array([1.0,0,0]); e1=e1-(e1@ns)*ns; e1/=np.linalg.norm(e1); e3=ns; e2=np.cross(e3,e1)
o=cen.copy(); o[0]=0.0
R=np.vstack([e1,e2,e3]); T=np.eye(4); T[:3,:3]=R; T[:3,3]=-R@o
np.save('win/T_seat.npy',T); print('origin',np.round(o,3),'e2',np.round(e2,4))
M=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))).transform(T[:3,:])
M.to_mesh(); import pickle
def hole_at(z):
    ps=[np.asarray(p) for p in M.slice(z).to_polygons()]
    from matplotlib.path import Path
    hs=[p for p in ps if Path(p).contains_point((0.0,0.0))]
    # the smallest polygon containing the centre = the pocket / opening boundary
    hs=sorted(hs,key=lambda p:abs(0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])))
    return hs[0] if hs else None
out={}
for z in (-0.7,0.5,1.0,2.0,3.0,3.4,4.0,4.3,4.7,5.3,5.5):
    h=hole_at(z); out[z]=h
    if h is not None: print('z %+.1f: x %.2f..%.2f  y %.2f..%.2f  area %.0f'%(z,h[:,0].min(),h[:,0].max(),h[:,1].min(),h[:,1].max(),abs(0.5*np.sum(h[:,0]*np.roll(h[:,1],-1)-np.roll(h[:,0],-1)*h[:,1]))))
pickle.dump(out,open('win/outlines.pkl','wb'))
