# Snap frame v2: 0.7 mm bead with a steep holding face, carried on flexible beams (through-slots) so it really clicks.
import sys,numpy as np,pickle,trimesh,manifold3d as mf
O=pickle.load(open('win/outlines.pkl','rb')); T=np.load('win/T_seat.npy')
CS=lambda p: mf.CrossSection([p if 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])>0 else p[::-1]])
def isect(lst):
    a=lst[0]
    for b in lst[1:]: a=a^b
    return a
W_fr=isect([CS(O[z]) for z in (2.0,3.0,3.4,5.3,5.5)]); OPEN=CS(O[-0.7])
GAP=0.10; Z0,Z1=2.0,5.55
outer=W_fr.offset(-GAP,mf.JoinType.Round)
frame=(outer-OPEN).extrude(Z1-Z0).translate([0,0,Z0])
for i in range(1,7):
    frame=frame-OPEN.offset(0.1*i,mf.JoinType.Round).extrude(0.1*(7-i)+0.01).translate([0,0,Z1-0.1*(7-i)])
def band(y0,y1): return mf.CrossSection.square([50,y1-y0]).translate([10,y0])+mf.CrossSection.square([50,y1-y0]).translate([-60,y0])
# beams: (y-range along the window, beam width, bead protrusion, bead y-range)
BEAMS=[((-27.0,7.0),1.7,0.70,(-23.0,3.0)),     # slanted sides, 34 mm beams
       ((26.0,49.0),1.3,0.50,(29.0,46.0))]     # straight lower sides, 23 mm beams
for (y0,y1),bw,p,(b0,b1) in BEAMS:
    slot=(outer.offset(-bw,mf.JoinType.Round)-outer.offset(-bw-1.0,mf.JoinType.Round))^band(y0,y1)
    frame=frame-slot.extrude(10).translate([0,0,Z0-1])
    for z in np.arange(3.70,4.95,0.05):
        q=np.interp(z+0.025,[3.70,4.40,4.80,4.95],[0,1,1,0])*p     # 45 deg lead-in below, ~75 deg holding face on top
        if q<0.02: continue
        for (c0,c1,f) in ((b0,b0+2,0.5),(b0+2,b1-2,1.0),(b1-2,b1,0.5)):
            ring=(outer.offset(q*f,mf.JoinType.Round)-outer.offset(-0.6,mf.JoinType.Round))^band(c0,c1)
            frame=frame+ring.extrude(0.05).translate([0,0,z])
frame=frame-mf.Manifold.cube([8,3,10]).translate([-4,-47.5,0])      # pry notch at the narrow end
frame=max(frame.decompose(),key=lambda q:q.volume())
print('frame v2: vol %.0f mm3, status %s'%(frame.volume(),frame.status()))
k=frame.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export('win/frame2_seat.stl')
for hf in sys.argv[1:]:
    t=trimesh.load(hf); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))).transform(T[:3,:])
    A=trimesh.load('win/acrylic_seat.stl'); Am=mf.Manifold(mf.Mesh(vert_properties=np.asarray(A.vertices,np.float32),tri_verts=np.asarray(A.faces,np.uint32))).translate([0,0,0.005])
    print(hf.split('/')[-1],': seated frame/head %.4f, frame/perspex %.4f, perspex/head %.4f'%((frame^H).volume(),(frame^Am).volume(),(Am^H).volume()))
    print('   pressing in (frame above its seat): '+' '.join('%.1f:%.1f'%(dz,(frame.translate([0,0,dz])^H).volume()) for dz in (0.1,0.3,0.6,0.9,1.2,1.5,2.0)))
# how far the bead reaches into the groove (beyond the pocket wall) and the room left
print('bead tip beyond the pocket wall: slanted %.2f mm, lower %.2f mm (groove is 0.80 deep)'%(0.70-GAP,0.50-GAP))
