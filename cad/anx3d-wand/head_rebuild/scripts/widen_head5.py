# v65: widening follows the nozzle axis (V), window frame kept proportional (rigid), stretch moved into the plain window middle.
# Widen the suction nozzle of the ANX3D head by W mm (W/2 per side), work frame (axis at x=y=0, joint at z>-199).
# Neck, thread spigot, shutter track, logo, back spray channel: untouched (centre band |u|<U0 and everything above ZA).
# Side walls / corners / clips (|u|>U1) move out rigidly by W/2; the plain band in between is stretched.
import sys,numpy as np,trimesh,manifold3d as mf
SRC,OUT=sys.argv[1],sys.argv[2]; W=float(sys.argv[3]) if len(sys.argv)>3 else 15.0
t=trimesh.load(SRC); H=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
ZA,ZB=-188.0,-250.0
VA,VB=float(sys.argv[4]) if len(sys.argv)>4 else 67.0, float(sys.argv[5]) if len(sys.argv)>5 else -32.0                       # widening ramps along the whole original flare (straight sides kept straight)
Z0,Z1,HW0,HW1=-188.0,-250.0,21.0,44.0     # original flare: half-width 21 at z-188 -> 44 at z-250 (straight sides)
U0,U1,EPS=0.415,0.705,0.08
def sp(x,e): return np.where(x<-e,0.0,np.where(x>e,x,(x+e)**2/(4*e)))
def ramp(s,e): return (sp(s-e,e)-sp(s-1+e,e))/(1-2*e)          # smooth 0->1 on [0,1], C1, exactly 0 / 1 outside
def warp(v):
    v=np.array(v,dtype=float); x,z=v[:,0],v[:,2]
    yy=v[:,1]; Vn=((yy+41.6)+(z+235.0))*np.sqrt(0.5)          # position along the nozzle (window-plane coordinate)
    D=0.5*W*ramp((VA-Vn)/(VA-VB),EPS)*ramp((-188.0-z)/2.0,0.2)  # widen along the nozzle axis; nothing above the neck/flare corner (z>-188)
    hw=HW0+(HW1-HW0)*np.clip((Z0-z)/(Z0-Z1),0,1)
    x0=np.maximum(U0*hw,17.0)        # untouched centre: logo (13), track pad/text/arrows (14.7), back spray-channel panel (16.5)
    x1=np.maximum(U1*hw,x0+3.0)      # stretch band at least 3 mm wide
    g_back=ramp((np.abs(x)-x0)/np.maximum(x1-x0,0.05),EPS)
    # window face (top of the nozzle): stretch only the plain middle of the window (|x| 1..8.5) so the window frame,
    # its rounded corners and the seat ledges move out rigidly with the side walls -> same frame width all round
    y=v[:,1]; s2=np.sqrt(0.5); hW=((y+41.6)-(z+235.0))*s2; vW=((y+41.6)+(z+235.0))*s2
    wf=ramp((hW-2.0)/4.0,0.2)                                    # 1 on the top (window) face of the nozzle, 0 on the back
    wl=ramp((vW-39.5)/1.5,0.2)*(1-ramp((vW-50.4)/1.2,0.2))         # logo strip V 41..50.4 (letters |x|<15.5, bevel from |x|~18.5)
    g_mid=ramp((np.abs(x)-1.0)/7.5,EPS)                             # stretch only the plain middle (window, top face)
    g_logo=ramp((np.abs(x)-15.7)/2.0,EPS)                           # beside the letters, before the bevel
    g=(1-wf)*g_back+wf*((1-wl)*g_mid+wl*g_logo)
    v[:,0]=x+np.sign(x)*D*g; return v
R=H.refine_to_length(0.8)
N=R.warp_batch(warp)
print('status',N.status(),'faces',N.num_tri(),'vol %.0f -> %.0f'%(H.volume(),N.volume()))
k=N.to_mesh(); tt=trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3].astype(np.float64),np.asarray(k.tri_verts),process=False)
print('bbox',np.round(N.bounding_box(),2)); tt.export(OUT)
