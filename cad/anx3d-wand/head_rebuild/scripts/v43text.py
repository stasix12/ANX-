import sys, math, cadquery as cq
FONT='fonts/ab.ttf'; R_PAD=22.6; XC=13.15; ZC=-183.2; TXT=sys.argv[2] if len(sys.argv)>2 else 'ANX SoftTouch'
out=None
for s in (1,-1):
    th=math.asin(XC/R_PAD); nrm=cq.Vector(s*math.sin(th),math.cos(th),0)
    org=nrm*(R_PAD+0.6)+cq.Vector(0,0,ZC)
    pl=cq.Plane(origin=org, xDir=cq.Vector(0,0,1), normal=nrm)
    def build(fs): return cq.Workplane(pl).text(TXT, fs, -3.0, fontPath=FONT, halign='center', valign='center', combine=False).val()
    t=build(3.0); bb=t.BoundingBox(); L=bb.zlen
    h=max(abs(bb.xlen),abs(bb.ylen)) if False else None
    fs=3.0*min(22.5/L, 1.0); t=build(fs); bb=t.BoundingBox()
    print('side',s,'font %.2f -> length %.1f mm (z %.1f..%.1f)'%(fs,bb.zlen,bb.zmin,bb.zmax))
    out=t if out is None else out.fuse(t)
cq.exporters.export(cq.Workplane().add(out), sys.argv[1], tolerance=0.005, angularTolerance=0.05)
