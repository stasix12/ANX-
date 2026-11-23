# Test plate: 5 snap-frame grip variants (v6-1..5) for one head, flat, bottom on the bed, separate named objects.
import sys,numpy as np,trimesh,manifold3d as mf
WD,TAG,OUT=sys.argv[1],sys.argv[2],sys.argv[3]
V=[(0.80,0.08,0.05),(0.85,0.05,0.08),(0.90,0.05,0.12),(0.90,0.00,0.12),(0.95,0.00,0.18)]
NM=['1dot_mild','2dots','3dots_medium','4dots','5dots_tightest']
Ms=[]
for k in range(5):
    t=trimesh.load(WD+'/fvar%d.stl'%(k+1)); Ms.append(mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32))))
bb=[np.array(m.bounding_box()) for m in Ms]; w=max(b[3]-b[0] for b in bb); h=max(b[4]-b[1] for b in bb); gx,gy=8.0,10.0
rows=[[0,1,2],[3,4]]; sc=trimesh.Scene(); CX,CY=175.0,160.0
for r,row in enumerate(rows):
    y=CY+(0.5-r)*(h+gy)
    for c,k in enumerate(row):
        x=CX+(c-(len(row)-1)/2)*(w+gx); b=bb[k]
        M=Ms[k].translate([x-(b[0]+b[3])/2,y-(b[1]+b[4])/2,-b[2]]); q=M.to_mesh()
        tm=trimesh.Trimesh(np.asarray(q.vert_properties)[:,:3].astype(float),np.asarray(q.tri_verts),process=False)
        assert tm.is_watertight, k
        n='ANX3D_%s_FRAME_v6-%d_%s'%(TAG,k+1,NM[k]); sc.add_geometry(tm,node_name=n,geom_name=n)
        print(n,'B %.2f G %.2f P %.2f'%V[k],'bounds',tm.bounds.round(1).tolist())
sc.export(OUT)
