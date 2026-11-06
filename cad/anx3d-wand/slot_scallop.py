# Cut the flare back beside the spray-tube slot (both sides) along a smooth curve, so it blends into the grip.
# Works on the handle in its print position (ring end on the bed). Thread / ring / grip untouched.
import sys,numpy as np,trimesh,manifold3d as mf
IN,OUT=sys.argv[1],sys.argv[2]; D=float(sys.argv[3]) if len(sys.argv)>3 else 10.0
s=trimesh.load(IN); t=s.to_geometry() if isinstance(s,trimesh.Scene) else s
M=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
z0b=t.bounds[0][2]
pts=np.vstack([np.asarray(p) for p in M.slice(z0b+5.0).to_polygons()])
RO=(pts[:,0].max()-pts[:,0].min())/2; cx=(pts[:,0].max()+pts[:,0].min())/2; cy=pts[:,1].max()-RO
ZTOP=z0b+21.75; Z0=z0b+21.1; ZF=z0b+41.7; RT,SL,RG=17.4,8.3,18.6
def rflare(z):
    tt=np.clip((z-Z0)/(ZF-Z0),0,1); return RT+(RO-RT)*(1-tt)**2
ZA=ZTOP-3.0; RW=22.6                     # start 3 mm down on the ring; never closer than 22.6 to the thread there
def rkeep(T,Z):
    rf=rflare(Z)+0.08
    x=np.abs(rf*np.cos(T)); back=np.sin(T)<0
    d=np.clip((x-SL)/D,0,1); w=d*d*(3-2*d)                      # smoothstep: 0 at the slot edge -> 1 at D mm away
    w=np.where(back,w,1.0)
    # floor: on the ring (below ZTOP) round down to 22.6, above it slope to the grip (18.6) over 4 mm
    sz=np.clip((Z-ZA)/(ZTOP-ZA),0,1); sz=sz*sz*(3-2*sz)
    floor=np.where(Z<ZTOP, rf-(rf-RW)*sz, np.maximum(RG, RW-(RW-RG)*np.clip((Z-ZTOP)/4.0,0,1)))
    return np.maximum(floor, floor+(rf-floor)*w)
nth=1440; zs=np.arange(ZA,ZF+0.3,0.1); th=np.linspace(0,2*np.pi,nth,endpoint=False)
T,Z=np.meshgrid(th,zs); R=rkeep(T,Z)
V=np.c_[(cx+R*np.cos(T)).ravel(),(cy+R*np.sin(T)).ravel(),Z.ravel()]
nz=len(zs); idx=lambda i,j: i*nth+(j%nth); F=[]
for i in range(nz-1):
    for j in range(nth):
        a,b,c,d_=idx(i,j),idx(i,j+1),idx(i+1,j+1),idx(i+1,j); F+=[(a,b,c),(a,c,d_)]
nb=len(V); V=np.vstack([V,[cx,cy,zs[0]],[cx,cy,zs[-1]]])
for j in range(nth): F.append((nb,idx(0,j+1),idx(0,j))); F.append((nb+1,idx(nz-1,j),idx(nz-1,j+1)))
K=mf.Manifold(mf.Mesh(vert_properties=np.asarray(V,np.float32),tri_verts=np.asarray(F,np.uint32)))
print('keep-envelope status',K.status(),'vol %.0f'%K.volume())
remove=mf.Manifold.cylinder(zs[-1]-zs[0],45,45,256).translate([cx,cy,zs[0]]) - K
N=M-remove; N=max(N.decompose(),key=lambda q:q.volume())
print('axis %.2f %.2f RO %.2f | removed %.0f mm3'%(cx,cy,RO,M.volume()-N.volume()))
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(np.float64),np.asarray(k.tri_verts),process=False)
sc=trimesh.Scene(); sc.add_geometry(tt,node_name='ANX3D_v59_SHORT_HANDLE',geom_name='ANX3D_v59_SHORT_HANDLE'); sc.export(OUT)
print('watertight',tt.is_watertight)
