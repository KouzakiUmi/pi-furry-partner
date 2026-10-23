# DSH fixed display calibration

DSH previously stretched every authored 640×640 source canvas into the same
visible square. Equal source-canvas sizes did not imply equal character sizes:
the buried-search scene uses a smaller subject with a large tail and document
pile, while the magnifier scene has nearly the same face size as the ordinary
pose but is shifted right.

The floating pet now uses fixed calibration in `lib/dsh-presentation.mjs`.
Source WebP/PNG pixels and video timelines are unchanged.

| Family | Uniform display scale | Source anchor → target anchor, 640px units |
| --- | ---: | --- |
| Ordinary poses and authored expressions | 1.00 | (320,602) → (320,602) |
| Magnifier/watch | 1.00 | (338,604) → (320,602) |
| Buried search and compacting | 1.30 | (360,580) → (320,602) |

Anchors use the resting body/support-paw projection and claw contact line, not
the lowest document edge. The normal nose is (288,318); ordinary eye spacing is
approximately 123–125px, versus approximately 124px in the first magnifier frame.
That supports keeping watch at 1.00 with a fixed 18px leftward correction.
Movement within the magnifier clip remains part of the actual video and is not
corrected frame by frame.

Search has substantial forward-pitch foreshortening. Its planted gray-palm width
is approximately 90–98px, versus approximately 144–158px in the normal front paw.
The limbs may be different front/hind paws with different angles, so this is only
a sanity check; matching them mechanically at 1.5–1.6× would be unjustified.
Search therefore uses a conservative fixed 1.30× correction while preserving the
foreshortened hood and stance.

At the normal 196px preference:

| Landmark | Before | After |
| --- | ---: | ---: |
| Ordinary gray-palm median width | 44.10px | 44.10px |
| Search gray-palm median width | 27.56px | 35.83px |
| Ordinary claw contact line | y184.36px | y184.36px |
| Search claw contact line | y177.63px | y184.36px |
| Watch claw contact line | y184.98px | y184.36px |
| Search projected support center | x110.25px | x98.00px |
| Watch projected support center | x103.51px | x98.00px |

This addresses the display discontinuity without claiming that a hidden,
foreshortened head has the same projected width as the frontal pose.

## Paint surface and input safety

The floating interaction square keeps the saved user size. A separate,
absolutely positioned, pointer-transparent canvas paints into extra transparent
space: left 30%, top 35%, right 15%, bottom 10%. The resulting paint surface is
1.45× the interaction width and height. Every corner of the full 640px source
canvas fits inside this paint surface under every fixed calibration and every
pose family, so tail/hood contours are not clipped
by the old fixed square. Alpha bounds are used only for diagnostics, never to
choose a frame's size or center.

Viewport clamping reserves that same envelope for every family. A large pet
is reduced only when necessary to fit the current window; its saved size,
continuous zoom and position preferences are not overwritten. Drag, wheel and
resize handling keep using the interaction square. Transparent overflow cannot
capture clicks from the composer or surrounding controls. The title uses separate compact branding media; the removed composer chip has no layout footprint.

## Transitions and actual frames

Every family receives its fixed scale and anchor from its first displayed
frame. A 220ms mild single-image entrance runs only at family changes, from 84%
opacity to full opacity. It draws only the current real frame, with no old image
under it. Delayed assets keep the profile of the actual held image; the entrance
starts when the new family's real image becomes available. Fast changes continue
from the current entrance opacity. Pause settles immediately to full opacity.

Interpolating the previous family's scale was deliberately avoided: entering a
normal pose from search at the old 1.30× scale would create a new size overshoot.
The source-specific size correction stays constant throughout the entire clip,
including its entrance.
No local warps, invented sway, tail scaling, source-frame mutation, optical flow
or pixel crossfade is added. H3 images are drawn once per canvas update. Ordinary
micro-motion continues through its existing independent layer, and recorded H3
clips retain their existing `transform: null` behavior.

Checks include fixed-anchor equations, full-source-canvas containment for all
pose families and entrances, unchanged geometry across 198 internal video-frame
samples, viewport sizes from mobile-width to desktop, persisted-preference
immutability, actual bundled canvas draw calls, pointer-transparent overflow,
stable interaction dimensions and an actual controller transition into search.
