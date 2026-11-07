# ANX3D sofa / curtain cleaning wand - print files

Saved here so the CAD files survive cloud-session resets.

| File | What it is |
|---|---|
| `ANX3D_v53B_FLUSH_SHORT_HANDLE_smooth.3mf` | Older handle v53B (ring flush with the head), backup of the user's copy. |
| `ANX3D_v58_SHORT_HANDLE.3mf` | Grip handle v58 (threaded ring, smooth flare to the grip, stop 12 deg earlier). Fits head v48. |
| `ANX3D_v60_SHORT_HANDLE.3mf` | v58 with the flare cut flush with the two ring-end faces beside the spray-tube slot (radial planes at +-30 deg). No shelf or spike over the gap: the ring-end face runs straight up and its outline is the flare's arc into the grip. Ring, thread, ring ends, channel lips, front half and grip are untouched (checked: every vertex outside the cut is identical to v58 within 0.00002 mm). Stop face loses 2.6 % of its area, only inside the gap. |
| `slot_trim.py` | Script that makes v60 from v58 (trimesh + manifold3d): `python slot_trim.py v58.3mf v60.3mf`. |
| `v60_preview.png` | Close-up cut-away of one ring end: v59 attempt (top) vs v60 (bottom). |
| `v60_changes_vs_v58.png` | v60 with the only material removed from v58 shown in red. |
| `ANX3D_v62_HEAD_WIDE-113mm.3mf` | Suction head v62: nozzle widened 88 -> 113 mm (12.5 mm per side), suction slot 75.9 -> 100.9 mm long (gap 4.2 mm unchanged), flare sides kept straight. Neck, thread spigot, shutter track, logo, back spray channel and its panel untouched (centre +-17 mm and everything above the flare). Same thread as v48: screws into v60 and stops at the same angle. Print upside down (spigot on the bed). |
| `ANX3D_v62_HEAD+v60_SHORT_HANDLE_print.3mf` | Print plate (Bambu H2D 350x320): head v62 upside down on its thread end + handle v60 on its ring end, separate objects (one colour each). Preview `v62_plate.png`. |
| `ANX3D_v48_HEAD_rebuilt.3mf` | Head v48 rebuilt from the v34 source (volume 149755 mm3 = original). Backup. |
| `v62_vs_v48_head.png`, `v62_assembled.png` | Old vs new head (front / back / side) and both mounted on handle v60. |
| `source/ANX3D_handle_SHORT_v34_WIDE_print.stl` | One-piece v34 wand (user's file) - source of the head. |
| `head_rebuild/` | Scripts + font to rebuild head v48 from v34 and widen it (`bash run.sh <python>`). |

Print: ABS, 100% infill, 6 walls, fan max 20%, ring end on the bed.
