# Agent Climate

Interactive Vancouver SO₂ source scenario, initialized 2026-11-04 at 18:00 UTC, through 2026-11-19 at 18:00 UTC.

- [3D viewer](https://baiming-zhang.github.io/Agent_climate/forecast/)
- [Methods, equations and results](https://baiming-zhang.github.io/Agent_climate/results/)
- [Code and raw results · Climate(Baiming)](https://github.com/wang-mengdi/Agentic-Physical-Worlds/tree/Climate%28Baiming%29/climate)

The complete 360-hour period plays in 15 seconds by default, with 0.25×–4× speed options, actual outlet-origin 3D concentration fields, actual hourly forecast precipitation, wet-removal glyphs and native 0–20 m surface queries. All 16 actual AGL layers are retained. Scalar values and geometry are interpolated; no RGB frame mixing or cross-fading is used.

The current release shows **three-source increments**, not total ambient concentration. Particle-derived initial-background propagation failed local concentration-fidelity checks and has been excluded. The original evidence and failed conservative-sampling candidate remain documented. Background work is deferred at the user’s request.

Weather uses frozen GFS 0–360 h,9/3 km domains, Noah-MP and a documented private WRF-compatible JAX research implementation. Native FLEXPART transport uses 8 CPU threads. The authorized 24 h precipitation consistency criterion is per-frame grid-RMSE≤2 mm; the maximum is 1.405205 mm. The original 1 mm failures are preserved. None of these checks validate future observations.

Buildings and terrain are simplified display geometry with 1.8× vertical exaggeration. The latest release starts native particles at the reported outlet disks. Finite-density integral momentum, heat and entrainment parameterize thermal rise; prescribed 50-level wind varies with height. SO₂ receives this wind without modifying it. Actual local 96³ particle-residence fields replace the former camera-facing origin guide and are combined with the regional field using weights summing to one. Fine bins do not establish near-nozzle physical accuracy or particle-count convergence. This is not resolved stack/building CFD. SO₂ is invisible; colour and opacity are artificial display choices. See THIRD_PARTY.md for data and software attribution.


## Scientific

Scientific view: https://baiming-zhang.github.io/Agent_climate/forecast/scientific/

This subview retains the earlier final-height source calculation and has not been recomputed for outlet-origin r 04. It remains available as Scientific. Blue-white concentration maps with cached Mapzen shaded terrain and no location labels; all 360 hourly selected-source fields, synchronized five-receptor hourly/24 h curves, source mass balance,3840 x 2160/24 fps/30 s MP 4, vector SVG and native F32/CSV/JSON downloads. Maps use declared scalar sigma 0.6-cell filtering and shape-preserving interpolation; native numeric products and curves remain unchanged. No image-frame blending. Initial background evolution and future observations are excluded from this scientific view.

Published views are the current 3D forecast, Scientific, and the methods/results page. Superseded interactive pages and their unused assets have been removed.
