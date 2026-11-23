# Window for the wide head (v63 screw-on / v65 one-piece)

The window pocket on the nozzle top already has a seat ledge (5 mm) and a snap groove (0.8 x 1.4 mm) under a 0.6 mm lip.

| File | What |
|---|---|
| `ANX3D_window_wide-113mm_PRINT_frame+window.3mf` | Ready-to-print plate: snap frame v5 (flush) + the 2 mm window plate, flat, two objects (window can get a clear filament). Preview `window_print_plates.png`. |
| `ANX3D_window_perspex-2mm.dxf` / `.svg` | Perspex (acrylic) 2 mm window, 88.8 x 100.1 mm, 0.3 mm clearance to the pocket wall. For laser cutting. |
| `ANX3D_window_perspex-2mm_TEMPLATE_A4_1to1.pdf` | Same outline on A4 at 1:1 (print at 100 %, check the 100 mm ruler). |
| `ANX3D_window_perspex-2mm_STENCIL.3mf` | 2 mm printable stencil of the same outline (trace onto the perspex). |
| `ANX3D_window_wide-113mm_FRAME_snap-v5_flush.3mf` | Snap frame v5 (current): slim 2.45 mm border like v4, but flush with the head - top 0.03-0.05 mm under the pocket lip (3.58 mm thick); 0.7 mm bead on the long sides, 1 mm pry notch, 0.3 mm chamfer on the outer top edge. Fits the v69 heads (one-piece and screw-on). Print flat. Picture `window_frame_v5_flush.png`. (v4 = the same 1.6 mm higher, in git history.) |
| `ANX3D_window_wide-113mm_FRAME_test-set_v6-1to5.3mf` | **Grip test set v6** (v5 printed loose): one plate, 5 frames, 1-5 dots on top at the narrow end = mild to tightest. v6-1 bead 0.80 / side gap 0.08 / press 0.05 - v6-2 0.85 / 0.05 / 0.08 - v6-3 0.90 / 0.05 / 0.12 - v6-4 0.90 / 0.00 / 0.12 - v6-5 0.95 / 0.00 / 0.18 (bead = ridge beyond the frame edge on the slanted sides, lower sides 0.2 less; press = ridge raised so its top hooks under the groove top and pulls the frame down on the glass). Inner edge and top exactly as v5. Seated grip in the groove 0 / 0.2 / 1.6 / 3.0 / 6.7 mm3, same on the one-piece and screw-on v69 heads. Picture `window_frame_v6_test-set.png`. Built by `build_frame_var.py` + `export_var.py`. |
| `v65_window_frame_assembly.png` | Exploded / assembled / section. |
| `v65_window_frame_v2.png` | Frame v2: top view with the spring cuts, and a section through a spring strip clicked into the groove. |
| `frame_geo.py`, `build_window.py`, `build_frame2.py`, `build_frame3.py`, `build_frame4.py`, `build_frame5.py` | Seat-plane fit + outlines, and the build of perspex + frame. |

Checked: seated, frame / perspex / head overlap = 0 in both v65 and v63; the ridge passes the lip with ~0.4 mm side flex.
