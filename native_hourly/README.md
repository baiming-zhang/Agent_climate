# Hangzhou — full-count native hourly query arrays

This directory contains every native hourly cell value from the completed continuous360-hour,353,894,400-primary-particle source-contribution run. It is a data archive, not the web-rendering approximation.

Each hour has sorted sparse little-endian uint32 indices and corresponding float64 cell masses in kg, each losslessly gzip-compressed. The index is `(k*368+j)*520+i`; absent cells are zero. All52 layers and the full500m horizontal domain are retained. Convert to micrograms/m³ with `1e9*mass/(500*500*layer_thickness_m)`. The0–25m query sums the native cell masses in that height interval and divides by its actual volume. Coordinates, edges, all file SHA256 values and original source-NPZ hashes are provided in the manifests.

These are hourly endpoint states after surface exchange, not daily averages or sampled near-path residence. The separate near-outlet display diagnostic must not be added to this physical mass.

The scalar particle physics is unchanged from the preserved stage15 CPU model. Qualified parallel scheduling changes execution, not the equations. Original GPU disagreement and earlier convergence failures remain preserved. This is a conditional four-EIA-outlet scenario with horizontally repeated forecast profiles, parameterized transport and uncalibrated surface exchange. It is not an observation-validated total-ambient Hangzhou forecast, terrain-resolved meteorology, WRF/FLEXPART, CFD or LES. City geometry is display context only.

The native values are hosted here so the Pages scene can load only the hours requested, while remaining within the Pages site-size bound. No native values have been quantized, cropped or replaced by graphics values.
