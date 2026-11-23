# Snap frame test set (v6-1..5): v5 flush slim frame with progressively more grip.
# B = bead protrusion beyond the frame edge (slanted sides; lower sides B-0.2), G = side gap to the pocket wall,
# P = bead raised by P -> its top face hooks harder under the groove top and pulls the frame down onto the glass.
# Variant k carries k small dots on top at the narrow end.
import sys,numpy as np,pickle,trimesh,manifold3d as mf
WD,OUT=sys.argv[1],sys.argv[2]; B,G,P=float(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5]); K=int(sys.argv[6]); HEADS=sys.argv[7:]
O=pickle.load(open(WD+'/outlines.pkl','rb')); T=np.load(WD+'/T_seat.npy')
CS=lambda p: mf.CrossSection([p if 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])>0 else p[::-1]])
def isect(lst):
    a=lst[0]
    for b in lst[1:]: a=a^b
    return a
W_fr=isect([CS(O[z]) for z in (2.0,3.0,3.4,5.3,5.5)])
Z0,Z1=2.0,5.58
outer=W_fr.offset(-G,mf.JoinType.Round); BW=2.45+(0.10-G)      # inner edge stays where it was in v5 (W_fr-2.55)
INNER=outer.offset(-BW,mf.JoinType.Round)
frame=(outer-INNER).extrude(Z1-Z0).translate([0,0,Z0])
for i in range(1,7):
    frame=frame-INNER.offset(0.1*i,mf.JoinType.Round).extrude(0.1*(7-i)+0.01).translate([0,0,Z1-0.1*(7-i)])
def band(y0,y1): return mf.CrossSection.square([50,y1-y0]).translate([10,y0])+mf.CrossSection.square([50,y1-y0]).translate([-60,y0])
zp=[3.70+P,4.40+P,4.80+P,4.95+P]
for p,(b0,b1) in ((B,(-23.0,3.0)),(B-0.2,(29.0,46.0))):
    for z in np.arange(zp[0],zp[3],0.05):
        q=np.interp(z+0.025,zp,[0,1,1,0])*p
        if q<0.02: continue
        for (c0,c1,f) in ((b0,b0+2,0.5),(b0+2,b1-2,1.0),(b1-2,b1,0.5)):
            ring=(outer.offset(q*f,mf.JoinType.Round)-outer.offset(-0.6,mf.JoinType.Round))^band(c0,c1)
            frame=frame+ring.extrude(0.05).translate([0,0,z])
for i in range(3):
    inset=0.1*(i+1); frame=frame-(outer.offset(0.3,mf.JoinType.Round)-outer.offset(-inset,mf.JoinType.Round)).extrude(0.101).translate([0,0,Z1-0.3+0.1*i])
nb=np.array(outer.bounds()); frame=frame-mf.Manifold.cube([8,1.5,12]).translate([-4,nb[1]-0.5,0])
# K dots on top along the narrow end, right of the pry notch
cl=max([np.asarray(q) for q in outer.offset(-BW/2,mf.JoinType.Round).to_polygons()],key=len)
top=cl[cl[:,1]<nb[1]+6]; top=top[top[:,0]>5.5]; top=top[np.argsort(top[:,0])]
d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(top,axis=0),axis=1))]
for k in range(K):
    s=1.0+2.4*k; pt=np.array([np.interp(s,d,top[:,0]),np.interp(s,d,top[:,1])])
    frame=frame-mf.Manifold.sphere(0.6,24).translate([pt[0],pt[1],Z1+0.25])
frame=max(frame.decompose(),key=lambda q:q.volume())
k_=frame.to_mesh(); trimesh.Trimesh(np.asarray(k_.vert_properties)[:,:3].astype(float),np.asarray(k_.tri_verts),process=False).export(OUT)
print('B %.2f G %.2f P %.2f dots %d | vol %.0f | bead tip beyond wall %.2f (groove 0.80) | bead top %.2f (groove top 5.02)'%(B,G,P,K,frame.volume(),B-G,4.95+P))
for hf in HEADS:
    t=trimesh.load(hf); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))).transform(T[:3,:])
    print('   %s: seated interference %.2f mm3 (the grip) | pressing in: %s'%(hf.split('/')[-1],(frame^H).volume(),' '.join('%.1f:%.1f'%(dz,(frame.translate([0,0,dz])^H).volume()) for dz in (0.3,0.6,0.9,1.2))))
