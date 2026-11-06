# ANX3D sofa / curtain cleaning wand - print files

Saved here so the CAD files survive cloud-session resets.

| File | What it is |
|---|---|
| `ANX3D_v58_SHORT_HANDLE.3mf` | Grip handle v58 (threaded ring, smooth flare to the grip, stop 12 deg earlier). Fits head v48. |
| `ANX3D_v60_SHORT_HANDLE.3mf` | v58 with the flare cut flush with the two ring-end faces beside the spray-tube slot (radial planes at +-30 deg). No shelf or spike over the gap: the ring-end face runs straight up and its outline is the flare's arc into the grip. Ring, thread, ring ends, channel lips, front half and grip are untouched (checked: every vertex outside the cut is identical to v58 within 0.00002 mm). Stop face loses 2.6 % of its area, only inside the gap. |
| `slot_trim.py` | Script that makes v60 from v58 (trimesh + manifold3d): `python slot_trim.py v58.3mf v60.3mf`. |
| `v60_preview.png` | Close-up cut-away of one ring end: v59 attempt (top) vs v60 (bottom). |
| `v60_changes_vs_v58.png` | v60 with the only material removed from v58 shown in red. |

Print: ABS, 100% infill, 6 walls, fan max 20%, ring end on the bed.
