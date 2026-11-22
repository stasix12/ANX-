# Window for the wide head (v63 screw-on / v65 one-piece)

The window pocket on the nozzle top already has a seat ledge (5 mm) and a snap groove (0.8 x 1.4 mm) under a 0.6 mm lip.

| File | What |
|---|---|
| `ANX3D_window_perspex-2mm.dxf` / `.svg` | Perspex (acrylic) 2 mm window, 88.8 x 100.1 mm, 0.3 mm clearance to the pocket wall. For laser cutting. |
| `ANX3D_window_perspex-2mm_TEMPLATE_A4_1to1.pdf` | Same outline on A4 at 1:1 (print at 100 %, check the 100 mm ruler). |
| `ANX3D_window_perspex-2mm_STENCIL.3mf` | 2 mm printable stencil of the same outline (trace onto the perspex). |
| `ANX3D_window_wide-113mm_FRAME_snap-v4_slim.3mf` | Snap frame v4 (current): 5.15 mm thick (1.6 mm above the head, outer top edge rounded) with the border halved to 2.45 mm (outer edge unchanged, so the window opening is bigger); no spring cuts - the slim border flexes by itself; 0.7 mm bead on the middle of the long sides, 1 mm pry notch at the narrow end; presses 2.25 mm onto the perspex edge. Print flat. Picture `window_frame_v4_slim.png`. |
| `v65_window_frame_assembly.png` | Exploded / assembled / section. |
| `v65_window_frame_v2.png` | Frame v2: top view with the spring cuts, and a section through a spring strip clicked into the groove. |
| `frame_geo.py`, `build_window.py`, `build_frame2.py`, `build_frame3.py`, `build_frame4.py` | Seat-plane fit + outlines, and the build of perspex + frame. |

Checked: seated, frame / perspex / head overlap = 0 in both v65 and v63; the ridge passes the lip with ~0.4 mm side flex.
