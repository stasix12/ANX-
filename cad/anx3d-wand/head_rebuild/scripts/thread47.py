# v45: HEAD carries a male screw spigot (2-start trapezoid thread), HANDLE carries the female sleeve.
# Screw until it stops on the shoulder -> always ends exactly straight. Sleeve bottom also traps the shutter in its track.
import sys, numpy as np, trimesh, manifold3d as mf
SRC, OUT = sys.argv[1], sys.argv[2]
m=trimesh.load(SRC)
G=mf.Manifold(mf.Mesh(vert_properties=np.asarray(m.vertices,np.float32),tri_verts=np.asarray(m.faces,np.uint32)))
ZS, ZT = -145.0, -123.0          # head collar top / handle shoulder (screw stops here)
RMAJ, DEP, P, NST = 21.0, 1.2, 3.0, 2   # v47: thread moved out 1.2 mm  # thread major radius, depth, pitch, starts (lead 6 mm)
CLR = 0.30                       # radial clearance in the female thread
RO = 24.7                        # sleeve outer radius
LEAD=P*NST
def slab(z0,z1): return mf.Manifold.cube([300,300,z1-z0]).translate([-150,-150,z0])
def cyl(r,z0,z1,n=256): return mf.Manifold.cylinder(z1-z0,r,r,n).translate([0,0,z0])
def prof(u):                     # trapezoid profile, 1 = crest, 0 = root (fractions of pitch)
    u=np.mod(u,P)/P
    return np.select([u<0.30, u<0.53, u<0.77], [1.0, 1-(u-0.30)/0.23, 0.0], (u-0.77)/0.23)
def radial_solid(rfun, z0, z1, nth=720, dz=0.1):
    th=np.linspace(0,2*np.pi,nth,endpoint=False); zs=np.arange(z0,z1+1e-9,dz); zs[-1]=z1
    T,Z=np.meshgrid(th,zs); R=rfun(T,Z)
    V=np.c_[(R*np.cos(T)).ravel(),(R*np.sin(T)).ravel(),Z.ravel()]
    nz,nt=Z.shape; idx=lambda i,j: i*nt+(j%nt)
    F=[]
    for i in range(nz-1):
        for j in range(nt):
            a,b,c,d=idx(i,j),idx(i,j+1),idx(i+1,j+1),idx(i+1,j)
            F+= [(a,b,c),(a,c,d)]
    nb=len(V); V=np.vstack([V,[0,0,z0],[0,0,z1]])
    for j in range(nt):
        F.append((nb,idx(0,j+1),idx(0,j))); F.append((nb+1,idx(nz-1,j),idx(nz-1,j+1)))
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(V,np.float32),tri_verts=np.asarray(F,np.uint32)))
def thread_r(extra, fade_top=None, fade_bot=None):
    def f(T,Z):
        u=Z-LEAD*T/(2*np.pi)
        d=DEP*prof(u)
        return RMAJ-DEP+extra+d
    return f
def void_cs(z, shrink=0.0):
    ps=[np.asarray(p) for p in G.slice(z).to_polygons()]
    area=lambda p:0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])
    outs=[p for p in ps if area(p)>0]; holes=[p for p in ps if area(p)<0]
    O=mf.CrossSection(outs); notch=O.hull()-O
    acc=mf.CrossSection([h[::-1] for h in holes])
    if shrink>0: acc=acc.offset(-shrink, mf.JoinType.Round)
    for c in [c for c in notch.decompose() if c.area()>3.0]:
        x0,y0,x1,y1=c.bounds(); acc=acc+c+mf.CrossSection.square([x1-x0,(y0+0.5)+40]).translate([x0,-40])
    return acc
def voids(z0,z1,step=0.25,shrink=0.0):
    acc=None
    for z in np.arange(z0,z1+1e-6,step):
        v=void_cs(z,shrink).extrude(step+0.02).translate([0,0,z-step/2-0.01]); acc=v if acc is None else acc+v
    return acc
VS=voids(ZS-0.2,ZT+0.2)
# ---------- HEAD: original below ZS + threaded spigot up to ZT (top face = the stop)
male=radial_solid(thread_r(0.0), ZS, ZT)
male=male ^ (mf.Manifold.cylinder(1.6,RMAJ+0.01,RMAJ-DEP-0.4,256).translate([0,0,ZT-1.6]) + cyl(RMAJ+1,ZS-1,ZT-1.6))   # lead-in chamfer at the top
VSI=voids(ZS-0.2,ZT+0.2,shrink=0.7)          # v47: spigot wall also 0.7 mm thicker inward -> 5.0 mm wall (was 3.1)
male=male - (mf.Manifold.cube([22.8,40,ZT-ZS+2]).translate([-11.4,0,ZS-1]) - cyl(19.8,ZS-2,ZT+2))   # flat front so the shutter slides past
spigot=male - VSI
HEAD=(G ^ slab(-400,ZS)) + spigot
# ---------- HANDLE: original above ZT + female sleeve down to ZS+0.3
female=radial_solid(thread_r(CLR), ZS-1, ZT)
VR=voids(ZT-0.2,ZT+3.6)
sleeve=cyl(RO,ZS+0.3,ZT+3.0) - female - VR          # roof ring ZT..ZT+3 joins the sleeve to the grip
sleeve=sleeve - (mf.Manifold.cylinder(1.2,RMAJ+CLR+1.0,RMAJ+CLR-0.2,256).translate([0,0,ZS+0.3-0.01]))      # entry chamfer at the bottom
sleeve=sleeve - (cyl(RO+5,ZT-0.5,ZT+4) - mf.Manifold.cylinder(4.0,RO,18.6,256).translate([0,0,ZT-0.5]))     # smooth top transition to the grip
gap=mf.CrossSection([np.array([(0,0),(40*np.cos(np.radians(-120)),40*np.sin(np.radians(-120))),(0,-40),(40*np.cos(np.radians(-60)),40*np.sin(np.radians(-60)))])]).extrude(60).translate([0,0,ZS-10])
sleeve=sleeve-gap                                                                                             # spray-tube slot at the back
mark=mf.Manifold.cube([1.0,3,5.0]).translate([-0.5,RO-0.8,ZS+2.0])                                            # alignment line (front)
HANDLE=(G ^ slab(ZT,400)) + (sleeve - mark)
for name,Pm in (('handle',HANDLE),('head',HEAD)):
    Pm=max(Pm.decompose(),key=lambda q:q.volume())
    k=Pm.to_mesh(); t=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False)
    print(name,Pm.status(),'watertight',t.is_watertight,'vol %.0f'%Pm.volume(),np.round(Pm.bounding_box(),1))
    t.export(OUT+'_'+name+'.stl')
