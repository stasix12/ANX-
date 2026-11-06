# v60: cut the flare flush with the two ring-end faces (radial planes at +-30.01 deg) beside the spray-tube slot.
# Inside the gap only the real grip / channel lip (r < RCUT) stays, so nothing overhangs the gap and the
# ring-end face continues straight up; its outline above the ring is the flare's own arc.
import sys,numpy as np,trimesh,manifold3d as mf
IN,OUT=sys.argv[1],sys.argv[2]
P0=np.radians(30.01); E=0.03; RCUT=17.42; ZF=41.7
s=trimesh.load(IN); t=s.to_geometry() if isinstance(s,trimesh.Scene) else s
M=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
z0b=t.bounds[0][2]
pts=np.vstack([np.asarray(p) for p in M.slice(z0b+5.0).to_polygons()])
RO=(pts[:,0].max()-pts[:,0].min())/2; cx=(pts[:,0].max()+pts[:,0].min())/2; cy=pts[:,1].max()-RO
def uv2xy(u,v): return (cx+u, cy-v)                       # v>0 = back (slot side)
c,s_=np.cos(P0),np.sin(P0); L=45
ur,vr=E*c+L*s_, -E*s_+L*c
poly=np.array([uv2xy(0,-E/s_), uv2xy(ur,vr), uv2xy(-ur,vr)])
if 0.5*np.sum(poly[:,0]*np.roll(poly[:,1],-1)-np.roll(poly[:,0],-1)*poly[:,1])<0: poly=poly[::-1]
H=ZF+z0b+1.0
W=mf.CrossSection([poly]).extrude(H).translate([0,0,z0b-1.0])
C=mf.Manifold.cylinder(H+2,RCUT,RCUT,1440).translate([cx,cy,z0b-2.0])
cut=W-C
N=M-cut; parts=sorted(N.decompose(),key=lambda q:-q.volume()); N=parts[0]
print('axis %.2f %.2f RO %.2f | removed %.1f mm3 | bodies %d (dropped %.3f mm3)'%(cx,cy,RO,M.volume()-N.volume(),len(parts),sum(p.volume() for p in parts[1:])))
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(np.float64),np.asarray(k.tri_verts),process=False)
sc=trimesh.Scene(); sc.add_geometry(tt,node_name='ANX3D_v60_SHORT_HANDLE',geom_name='ANX3D_v60_SHORT_HANDLE'); sc.export(OUT)
