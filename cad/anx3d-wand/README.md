# ANX3D sofa / curtain cleaning wand - print files

Saved here so the CAD files survive cloud-session resets.

| File | What it is |
|---|---|
| `ANX3D_v58_SHORT_HANDLE.3mf` | Grip handle v58 (threaded ring, smooth flare to the grip, stop 12 deg earlier). Fits head v48. |
| `ANX3D_v60_SHORT_HANDLE.3mf` | v58 with the flare cut flush with the two ring-end faces beside the spray-tube slot (radial planes at +-30 deg). No shelf or spike over the gap: the ring-end face runs straight up and its outline is the flare's arc into the grip. Thread, stop face, channel lips, front half and grip unchanged (ring ends shaved 0.03 mm). |
| `slot_trim.py` | Script that makes v60 from v58 (trimesh + manifold3d): `python slot_trim.py v58.3mf v60.3mf`. |
| `v60_preview.png` | Close-up cut-away of one ring end: v59 attempt (top) vs v60 (bottom). |

Print: ABS, 100% infill, 6 walls, fan max 20%, ring end on the bed.
