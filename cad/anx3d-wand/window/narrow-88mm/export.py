import numpy as np,pickle,trimesh,manifold3d as mf,matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
D='winN/'; TAG='narrow-88mm'
P=pickle.load(open(D+'acr_poly.pkl','rb'))['acr']; poly=max(P,key=len)
poly=np.c_[poly[:,0],-poly[:,1]]; poly=poly-[0.5*(poly[:,0].min()+poly[:,0].max()),0.5*(poly[:,1].min()+poly[:,1].max())]
W,H=np.ptp(poly[:,0]),np.ptp(poly[:,1]); print('perspex %.1f x %.1f mm'%(W,H))
base='ANX3D_window_%s_perspex-2mm'%TAG
L=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES','0','POLYLINE','8','CUT','66','1','70','1']
for x,y in poly: L+=['0','VERTEX','8','CUT','10','%.4f'%x,'20','%.4f'%y]
L+=['0','SEQEND','0','ENDSEC','0','EOF']; open(D+'out/'+base+'.dxf','w').write('\n'.join(L)+'\n')
m=5; d='M '+' L '.join('%.3f,%.3f'%(x-poly[:,0].min()+m,poly[:,1].max()-y+m) for x,y in poly)+' Z'
open(D+'out/'+base+'.svg','w').write('<svg xmlns="http://www.w3.org/2000/svg" width="%.2fmm" height="%.2fmm" viewBox="0 0 %.2f %.2f"><path d="%s" fill="none" stroke="red" stroke-width="0.1"/></svg>\n'%(W+2*m,H+2*m,W+2*m,H+2*m,d))
with PdfPages(D+'out/'+base+'_TEMPLATE_A4_1to1.pdf') as pdf:
    fig=plt.figure(figsize=(210/25.4,297/25.4)); ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,210); ax.set_ylim(0,297); ax.axis('off')
    cx,cy=105,165; q=np.vstack([poly,poly[:1]])+[cx,cy]
    ax.plot(q[:,0],q[:,1],'k-',lw=0.6); ax.plot([cx-3,cx+3],[cy,cy],'k-',lw=0.3); ax.plot([cx,cx],[cy-3,cy+3],'k-',lw=0.3)
    ax.text(cx,cy+H/2+6,'ANX3D window (88 mm head) - perspex 2 mm  (%.1f x %.1f mm)'%(W,H),ha='center',fontsize=11)
    ax.text(cx,cy+H/2+2,'narrow end = toward the ANX3D logo',ha='center',fontsize=8)
    ax.plot([30,130],[40,40],'k-',lw=1.2)
    for i in range(0,101,10): ax.plot([30+i,30+i],[40,43 if i%50 else 45],'k-',lw=0.6)
    ax.text(80,47,'100 mm check: print at 100% / "Actual size" and measure this line',ha='center',fontsize=8)
    ax.text(105,25,'Cut on the line. Edges: sand smooth. Keep the protective film on while cutting.',ha='center',fontsize=8)
    pdf.savefig(fig); plt.close(fig)
cs=mf.CrossSection([poly if 0.5*np.sum(poly[:,0]*np.roll(poly[:,1],-1)-np.roll(poly[:,0],-1)*poly[:,1])>0 else poly[::-1]])
def place(M,name,out):
    bb=np.array(M.bounding_box()); M=M.translate([175-(bb[0]+bb[3])/2,160-(bb[1]+bb[4])/2,-bb[2]]); k=M.to_mesh()
    t=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(float),np.asarray(k.tri_verts),process=False)
    sc=trimesh.Scene(); sc.add_geometry(t,node_name=name,geom_name=name); sc.export(out); return t
place(cs.extrude(2.0),base+'_STENCIL',D+'out/'+base+'_STENCIL.3mf')
t=trimesh.load(D+'frame2_seat.stl'); F=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
f=place(F,'ANX3D_window_%s_FRAME_snap-v2'%TAG,D+'out/ANX3D_window_%s_FRAME_snap-v2.3mf'%TAG); print('frame extents',np.round(f.extents,2),'vol %.0f'%f.volume)
