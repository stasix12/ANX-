# Widen the suction nozzle of the ANX3D head by W mm (W/2 per side), work frame (axis at x=y=0, joint at z>-199).
# Neck, thread spigot, shutter track, logo, back spray channel: untouched (centre band |u|<U0 and everything above ZA).
# Side walls / corners / clips (|u|>U1) move out rigidly by W/2; the plain band in between is stretched.
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]; W=float(sys.argv[3]) if len(sys.argv)>3 else 15.0
t=trimesh.load(SRC); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
ZA,ZB=-188.0,-250.0                       # widening ramps along the whole original flare (straight sides kept straight)
Z0,Z1,HW0,HW1=-188.0,-250.0,21.0,44.0     # original flare: half-width 21 at z-188 -> 44 at z-250 (straight sides)
U0,U1,EPS=0.415,0.705,0.08
def sp(x,e): return np.where(x<-e,0.0,np.where(x>e,x,(x+e)**2/(4*e)))
def ramp(s,e): return (sp(s-e,e)-sp(s-1+e,e))/(1-2*e)          # smooth 0->1 on [0,1], C1, exactly 0 / 1 outside
def warp(v):
    v=np.array(v,dtype=float); x,z=v[:,0],v[:,2]
    D=0.5*W*ramp((ZA-z)/(ZA-ZB),EPS)
    hw=HW0+(HW1-HW0)*np.clip((Z0-z)/(Z0-Z1),0,1)
    x0=np.maximum(U0*hw,17.0)        # untouched centre: logo (13), track pad/text/arrows (14.7), back spray-channel panel (16.5)
    x1=np.maximum(U1*hw,x0+3.0)      # stretch band at least 3 mm wide
    g=ramp((np.abs(x)-x0)/np.maximum(x1-x0,0.05),EPS)
    v[:,0]=x+np.sign(x)*D*g; return v
R=H.refine_to_length(0.8)
N=R.warp_batch(warp)
print('status',N.status(),'faces',N.num_tri(),'vol %.0f -> %.0f'%(H.volume(),N.volume()))
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(np.float64),np.asarray(k.tri_verts),process=False)
print('bbox',np.round(N.bounding_box(),2)); tt.export(OUT)
