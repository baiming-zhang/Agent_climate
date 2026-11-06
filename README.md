# Agent Climate

Interactive Vancouver SO₂ source scenario, initialized2026-11-04 at18:00 UTC, through2026-11-19 at18:00 UTC.

- [3D viewer](https://baiming-zhang.github.io/Agent_climate/forecast/)
- [Methods, equations and results](https://baiming-zhang.github.io/Agent_climate/results/)
- [Historical2021 case](https://baiming-zhang.github.io/Agent_climate/historical/)

The complete360-hour period plays in15 seconds by default, with0.25×–4× speed options, source-origin guides, actual hourly forecast precipitation, wet-removal glyphs and native0–20 m surface queries. All16 actual AGL layers are retained. Scalar values and geometry are interpolated; no RGB frame mixing or cross-fading is used.

The current release shows **three-source increments**, not total ambient concentration. Particle-derived initial-background propagation failed local concentration-fidelity checks and has been excluded. The original evidence and failed conservative-sampling candidate remain documented. Background work is deferred at the user’s request.

Weather uses frozen GFS0–360h,9/3 km domains, Noah-MP and a documented private WRF-compatible JAX research implementation. Native FLEXPART transport uses8 CPU threads. The authorized24h precipitation consistency criterion is per-frame grid-RMSE≤2 mm; the maximum is1.405205 mm. The original1 mm failures are preserved. None of these checks validate future observations.

Buildings and terrain are simplified display geometry with1.8× vertical exaggeration. Source stack paths are Briggs identification guides, not resolved CFD or additional queried concentration. SO₂ is invisible; colour and opacity are artificial display choices. See THIRD_PARTY.md for data and software attribution.
