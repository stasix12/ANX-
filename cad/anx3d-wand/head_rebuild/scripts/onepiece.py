# One-piece wand: wide head (v63) + handle v60 fused in the assembled position, thread zone filled solid.
# Outside look = the screwed-together pair (ring, flare, back slot); air bore and spray-tube notch stay open.
import sys,numpy as np,trimesh,manifold3d as mf
HEAD,HANDLE,OUT1=sys.argv[1],sys.argv[2],sys.argv[3]
src=open('scripts/thread47.py').read().split("VS=voids(")[0]
sys.argv=['x','v48/ext_SHORT.stl','/dev/null']; exec(src)          # G, ZS, ZT, void_cs(), voids(), cyl(), slab()
def L(f,off=(0,0,0)):
    t=trimesh.load(f); t=t.to_geometry() if hasattr(t,'to_geometry') else t; t.apply_translation(off)
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
H=L(HEAD); K=L(HANDLE,(-175.0,-172.83762,-144.7))      # handle v60 back in the work frame, head at its design (straight) pose
VSI=voids(ZS-0.2,ZT+0.2,shrink=0.7)                   # the head spigot's own air bore + spray-tube notch (kept open)
P0=np.radians(30.01); c,s=np.cos(P0),np.sin(P0)
gp=np.array([(0,0.05),(-45*s,-45*c),(45*s,-45*c)]); gp=gp if 0.5*np.sum(gp[:,0]*np.roll(gp[:,1],-1)-np.roll(gp[:,0],-1)*gp[:,1])>0 else gp[::-1]
gap=mf.CrossSection([gp]).extrude(40).translate([0,0,ZS-5])   # ring C-gap at the back (kept as is)
RO=24.7
fill1=((cyl(RO,ZS+0.3,ZT)-gap)-VSI)                   # thread zone inside the ring outline -> solid
hs=mf.CrossSection([np.asarray(p) for p in H.slice(ZS-0.05).to_polygons()])
fill2=(hs.extrude(0.36).translate([0,0,ZS-0.03]))-VSI # close the 0.3 mm slit between head collar and ring bottom
for nm_,m_ in (('H',H),('K',K),('VSI',VSI),('gap',gap),('fill1',fill1),('fill2',fill2)): print(nm_,m_.status(),'%.0f'%m_.volume())
ONE=H+K+fill1+fill2
parts=sorted(ONE.decompose(),key=lambda q:-q.volume()); ONE=parts[0]
print('bodies',len(parts),'dropped %.3f'%sum(p.volume() for p in parts[1:]),'| vol head %.0f + handle %.0f -> one %.0f'%(H.volume(),K.volume(),ONE.volume()))
# enclosed voids left in the joint zone?
R=cyl(30,ZS-2,ZT+2); air=R-ONE
enc=[a for a in air.decompose() if a.volume()>1e-4 and not (np.array(a.bounding_box())[[0,1]]<-29.5).any() and not (np.array(a.bounding_box())[[3,4]]>29.5).any() and a.bounding_box()[2]>ZS-1.9 and a.bounding_box()[5]<ZT+1.9]
print('enclosed air pockets in the joint: %d (%.3f mm3)'%(len(enc),sum(a.volume() for a in enc)))
k=ONE.to_mesh(); trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False).export(OUT1)
print('bbox',np.round(ONE.bounding_box(),2))
