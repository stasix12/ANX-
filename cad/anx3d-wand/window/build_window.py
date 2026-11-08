# Perspex window (2 mm) + snap-in frame for the ANX3D wide head (v63 / v65). Works in the seat frame:
# x across, y along the window (toward the nozzle tip), z up from the seat ledge.
import numpy as np,pickle,trimesh,manifold3d as mf
O=pickle.load(open('win/outlines.pkl','rb')); T=np.load('win/T_seat.npy')
CS=lambda p: mf.CrossSection([p if 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])>0 else p[::-1]])
inter=lambda zs: [CS(O[z]) for z in zs]
def isect(lst):
    a=lst[0]
    for b in lst[1:]: a=a^b
    return a
ACR_T=2.0; CL_A=0.30; CL_F=0.15
W_lo=isect(inter((0.5,1.0,2.0))); W_fr=isect(inter((2.0,3.0,3.4,5.3,5.5))); OPEN=CS(O[-0.7])
acr=W_lo.offset(-CL_A,mf.JoinType.Round)
Z0,Z1=ACR_T,5.55
outer=W_fr.offset(-CL_F,mf.JoinType.Round)
frame=(outer-OPEN).extrude(Z1-Z0).translate([0,0,Z0])
for i in range(1,7):     # 0.6 mm chamfer on the inner top edge
    frame=frame-OPEN.offset(0.1*i,mf.JoinType.Round).extrude(0.1*(7-i)+0.01).translate([0,0,Z1-0.1*(7-i)])
# snap bead: 0.5 mm, 45 deg lead-in below, ~50 deg back above; only on the long straight runs (sides + bottom)
# bead only on the middle of the two long sides (away from the stiff corners), ends tapered
segs=[(-25,-19,0.5),(-19,29,1.0),(29,35,0.5)]
bead=None
for y0,y1,f in segs:
    msk=mf.CrossSection.square([60,y1-y0]).translate([15,y0])+mf.CrossSection.square([60,y1-y0]).translate([-75,y0])
    for z in np.arange(3.85,4.85,0.05):
        p=f*np.interp(z+0.025,[3.85,4.35,4.45,4.85],[0,0.5,0.5,0])
        if p<0.02: continue
        ring=(outer.offset(p,mf.JoinType.Round)-outer.offset(-0.6,mf.JoinType.Round))^msk
        sl=ring.extrude(0.05).translate([0,0,z]); bead=sl if bead is None else bead+sl
frame=frame+bead
frame=frame-mf.Manifold.cube([8,3,10]).translate([-4,-47.5,0])     # pry notch at the top end (flat screwdriver)
frame=max(frame.decompose(),key=lambda q:q.volume())
acrM=acr.extrude(ACR_T)
print('acrylic: %.1f x %.1f mm, area %.0f mm2 | frame vol %.0f mm3, status %s'%(acr.bounds()[2]-acr.bounds()[0],acr.bounds()[3]-acr.bounds()[1],acr.area(),frame.volume(),frame.status()))
pickle.dump({'acr':[np.asarray(p) for p in acr.to_polygons()]},open('win/acr_poly.pkl','wb'))
def save(M,f):
    k=M.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(f)
save(frame,'win/frame_seat.stl'); save(acrM,'win/acrylic_seat.stl')
# fit check against the head (in the seat frame)
import sys
t=trimesh.load(sys.argv[1] if len(sys.argv)>1 else '../in64/out_HEAD_colour-1.stl'); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))).transform(T[:3,:])
A2=acrM.translate([0,0,0.005]); print("acrylic lifted 0.005 (contact noise removed): overlap %.4f"%(A2^H).volume())
print('seated: frame/head overlap %.4f | acrylic/head %.4f | frame/acrylic %.4f mm3'%((frame^H).volume(),(acrM^H).volume(),(frame^acrM).volume()))
for dz in (0.2,0.5,0.8,1.0,1.4):
    I=frame.translate([0,0,dz])^H; print('  frame %.1f mm higher (passing the lip): overlap %.3f mm3'%(dz,I.volume()))
gapz=[]
print('acrylic gap to pocket wall: %.2f mm (each side), frame gap %.2f mm'%(CL_A,CL_F))
