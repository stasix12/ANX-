# Window for the wide head (v63 screw-on / v65 one-piece)

The window pocket on the nozzle top already has a seat ledge (5 mm) and a snap groove (0.8 x 1.4 mm) under a 0.6 mm lip.

| File | What |
|---|---|
| `ANX3D_window_perspex-2mm.dxf` / `.svg` | Perspex (acrylic) 2 mm window, 88.8 x 100.1 mm, 0.3 mm clearance to the pocket wall. For laser cutting. |
| `ANX3D_window_perspex-2mm_TEMPLATE_A4_1to1.pdf` | Same outline on A4 at 1:1 (print at 100 %, check the 100 mm ruler). |
| `ANX3D_window_perspex-2mm_STENCIL.3mf` | 2 mm printable stencil of the same outline (trace onto the perspex). |
| `ANX3D_v65_window_FRAME_snap.3mf` | Snap frame (3.55 mm): presses the perspex onto the ledge, top flush with the lip; 0.5 mm snap ridge with 45 deg lead-in on the middle of both long sides clicks into the groove; pry notch at the narrow end. Print flat (underside on the bed). |
| `v65_window_frame_assembly.png` | Exploded / assembled / section. |
| `frame_geo.py`, `build_window.py` | Seat-plane fit + outlines, and the build of perspex + frame. |

Checked: seated, frame / perspex / head overlap = 0 in both v65 and v63; the ridge passes the lip with ~0.4 mm side flex.
