#!/bin/bash
# Rebuild head v48 from the v34 one-piece print STL, then widen it (v61). Needs python with trimesh, manifold3d, cadquery.
# Run from this folder:  bash run.sh /path/to/python
set -e; P=${1:-python3}; mkdir -p v41 v45 v48 wide out
# v34 print frame -> old work frame (axis at x=y=0, top at z=-21); found by aligning the grip with handle v58
$P -I - <<'PY'
import trimesh
t=trimesh.load('../source/ANX3D_handle_SHORT_v34_WIDE_print.stl',process=False); t.apply_translation([0.02481,-23.65096,-295.39945]); t.export('v34_SHORT.stl')
PY
$P -I scripts/v43text.py v41/text_softtouch.stl                 # "ANX SoftTouch" text (Archivo Black)
$P -I scripts/v43.py v34_SHORT.stl v45/deco_tmp_SHORT.stl        # frame lines + text      (log: removed 51.7 mm3)
# the old pad solid shW_add.stl is lost; the groove bridge (material 0.6 mm above and below) fills the same tick grooves
$P -I - <<'PY'
import numpy as np,trimesh,manifold3d as mf
t=trimesh.load('v45/deco_tmp_SHORT.stl'); A=mf.Manifold(mf.Mesh(vert_properties=np.asarray(t.vertices,np.float32),tri_verts=np.asarray(t.faces,np.uint32)))
P=(A.translate([0,0,0.6])^A.translate([0,0,-0.6]))^mf.Manifold.cube([32,40,26]).translate([-16,0,-173]); k=P.to_mesh()
trimesh.Trimesh(np.asarray(k.vert_properties)[:,:3],np.asarray(k.tri_verts),process=False).export('shW_add.stl')
PY
$P -I scripts/v44.py v45/deco_tmp_SHORT.stl v45/deco_SHORT.stl   # ticks -> arrows
$P -I scripts/fillholes.py v45/deco_SHORT.stl v45/deco47_SHORT.stl   # (log: filled 428.7 mm3)
$P -I scripts/extend48.py v45/deco47_SHORT.stl v48/ext_SHORT.stl
$P -I scripts/thread47.py v48/ext_SHORT.stl v48/v48S             # head: vol 149755, bbox [-44,-82.6,-295.4,44,22.6,-123]  (same as the log)
$P -I scripts/widen_head2.py v48/v48S_head.stl wide/head_w15.stl 15   # v61: nozzle 88 -> 103 mm
