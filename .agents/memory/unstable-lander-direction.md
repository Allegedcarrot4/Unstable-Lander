---
name: Unstable Lander direction
description: Product identity and reference boundaries for Unstable Lander.
---

Unstable Lander is its own game, taking broad lunar-lander gameplay inspiration from ehmorris.com/lander and a cloud-gaming/browser-launcher atmosphere from dusq.cloud and project-unstable.wasmer.app. Do not reuse their source, logos, or assets.

The play view should stay fullscreen without browser chrome or side panels. Keep speed and angle at bottom left, flight time or a red impact countdown in the center, and altitude at bottom right; use green for a safe landing approach and red for an unsafe one.

The lander wraps across the left and right edges and has no altitude ceiling. Keep all UI and canvas text in Space Grotesk. Show speed, angle, flight time, and altitude beside the lander while terrain is visible, then move the readouts to the bottom when it is not. Guidance arrows belong near the bottom, not above the craft, and crashes should visibly shatter the lander. Request browser fullscreen only on the initial start, not each retry.

**Why:** the user asked for a lander game with this combination of references, named Unstable Lander.

**How to apply:** preserve the original identity, unbounded wrapped flight, telemetry placement, arrow placement, and one-time fullscreen behavior when adding game modes or changing the interface. Keep the terrain and flight animation smooth, with the surface able to move out of view at high altitude.
