# ANX3D sofa / curtain cleaning wand - print files

Saved here so the CAD files survive cloud-session resets.

| File | What it is |
|---|---|
| `ANX3D_v58_SHORT_HANDLE.3mf` | Grip handle v58 (threaded ring, smooth flare to the grip, stop 12 deg earlier). Fits head v48. |
| `ANX3D_v59_SHORT_HANDLE.3mf` | v58 with the spike beside the spray-tube slot removed on both sides: above the ring only the real grip stays there, and the ring top edge next to the slot is rounded. Thread, stop face, front half and grip unchanged. |
| `slot_scallop2.py` | Script used to make v59 from v58 (trimesh + manifold3d): `python slot_scallop2.py v58.3mf v59.3mf 10`. |
| `v59_preview.png` | v58 (top) vs v59 (bottom). |

Print: ABS, 100% infill, 6 walls, fan max 20%, ring end on the bed.
