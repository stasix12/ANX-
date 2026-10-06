import trimesh, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
R=trimesh.transformations.rotation_matrix
rod=trimesh.load('rod_D40_L250.stl'); rod=trimesh.Trimesh(*trimesh.remesh.subdivide_to_size(rod.vertices,rod.faces,8)); cp=trimesh.load('clamp_coupler_D40.stl')
def centered(m,rot=np.eye(4),t=(0,0,0)):
    m=m.copy(); m.apply_translation(-m.bounds.mean(0)); m.apply_transform(rot); m.apply_translation(t); return m
def coupler_on_axis():
    c=cp.copy(); c.apply_translation([-c.bounds.mean(0)[0],-c.bounds.mean(0)[1],-c.bounds.mean(0)[2]])
    c.apply_transform(R(np.pi/2,[0,1,0]))        # axis along X; lugs toward +Y
    c.apply_translation([0,-(c.bounds[0][1]+30),0]); return c
toX=R(np.pi/2,[0,1,0])
def scene(gap): return [(centered(rod,toX,[-125-gap,0,0]),'#9aa5b1'),(centered(rod,toX,[125+gap,0,0]),'#9aa5b1'),(coupler_on_axis(),'#e07a2f')]
def draw(ax,parts,elev,azim,title):
    V=(R(np.radians(elev),[1,0,0])@R(np.radians(azim),[0,0,1]))[:3,:3]
    light=np.array([0.3,0.5,0.8]); light/=np.linalg.norm(light)
    P=[];C=[];D=[]
    for m,col in parts:
        t=m.triangles@V.T; n=m.face_normals@V.T
        keep=n[:,2]>0                                    # back-face cull
        sh=0.3+0.7*np.clip(n[keep]@light,0,1)+0.0
        P.append(t[keep][:,:,:2]); D.append(t[keep][:,:,2].mean(1))
        C.append(np.clip(np.array(matplotlib.colors.to_rgb(col))*sh[:,None],0,1))
    P=np.vstack(P);C=np.vstack(C);D=np.concatenate(D); o=np.argsort(D)
    ax.add_collection(PolyCollection(P[o],facecolors=C[o],edgecolors=C[o],linewidths=0.2))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title,fontsize=13)
fig=plt.figure(figsize=(16,13)); gs=fig.add_gridspec(3,2,height_ratios=[1,1,1.5])
ax=fig.add_subplot(gs[0,:]); draw(ax,scene(0),-65,-15,'Assembled: 2 x rod D40 x 250 mm + clamp coupler  =  500 mm total')
ax.annotate('',xy=(-250,-45),xytext=(250,-45),arrowprops=dict(arrowstyle='<->'))
ax=fig.add_subplot(gs[1,:]); draw(ax,scene(70),-65,-15,'Exploded view (slide each rod 50 mm into the coupler, tighten 4 x M5 bolts)')
ax=fig.add_subplot(gs[2,0]); draw(ax,[(coupler_on_axis(),'#e07a2f')],-60,-35,'Clamp coupler: OD 60, bore 40.4, length 100, 4 x M5')
ax=fig.add_subplot(gs[2,1]); draw(ax,[(centered(coupler_on_axis(),R(np.pi/2,[0,1,0])),'#e07a2f')],0,0,'End view: bore, split slot, bolt lugs')
plt.tight_layout(); plt.savefig('preview.png',dpi=110)
