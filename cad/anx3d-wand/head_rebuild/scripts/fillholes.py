import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]
t=trimesh.load(SRC); G=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
C=G.transform(np.array([[0,1,0,0],[0,0,1,0],[1,0,0,0]],float))       # X=y, Y=z, Z=x
ps=[np.asarray(p) for p in C.slice(11.5).to_polygons()]
ar=lambda p:0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])
outs=[p for p in ps if ar(p)>0]
plate=mf.CrossSection(outs).extrude(7.0).translate([0,0,8.0])                # filled outline (holes ignored), x 8..15
plate=plate.transform(np.array([[0,0,1,0],[1,0,0,0],[0,1,0,0]],float))       # back to x,y,z
fill=None
for (y,z) in ((-36,-178),(-20,-192)):
    c=mf.Manifold.cylinder(7.2,4.6,4.6,128).rotate([0,90,0]).translate([7.9,y,z]); fill=c if fill is None else fill+c
fill=fill ^ plate
N=G+fill; N=max(N.decompose(),key=lambda q:q.volume())
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False)
print('filled %.1f mm3, watertight %s'%(N.volume()-G.volume(),tt.is_watertight)); tt.export(OUT)
for (y,z) in ((-36,-178),(-20,-192)):
    for rp in (0,2,3.8,4.2):
        print('  probe hole',(y,z),'r',rp,'solid at x=14.9:',bool(tt.contains([[14.9,y+rp,z]])[0]),' x=9:',bool(tt.contains([[9,y+rp,z]])[0]))
