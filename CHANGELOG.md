# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **The horizontal thrust slider is repeated under the arch**, mirrored both
  ways with the one in the panel and sharing its enabled state. The panel
  scrolls; the parameter a student moves continuously should not be able to
  leave the screen while the drawing it changes is in full view. It matters
  most with *Drive from the thrust* on, where that slider alone commands the
  line and the panel's copy sits below the verdict text.

- **A scale bar on both plots**, chequered like a map's, in the bottom-right
  corner, hidden or shown with *Scale bar* in the toolbar. The value is always
  round — 1, 2 or 5 times a power of ten, off the same ladder the axis ticks
  are chosen on — and follows the zoom, so the bar keeps about a fifth of the
  width and the number changes instead. On the arch it measures a length; **on
  the force polygon it measures a force**, because the load line is the weights
  laid end to end and the pole's abscissa is the horizontal thrust, so every
  length on that drawing is one.

- **A circular ring built from its numbers** — inner radius, thickness ratio,
  voussoirs — with no image to trace. It is the ring the published figures for
  the admissible band and the least admissible thickness are computed on, from
  the same function, so a single point of either can now be checked in the
  browser: build the ring, drive from the thrust, and read the interval off the
  Mechanism panel.

- **An example may declare its own size**, as a `_scale` block giving how many
  units one pixel is worth, the system, and — required — `source`, where the
  dimension came from. **A scale without a source is refused** and the arch
  stays in pixels: a number without a provenance, in a repository published
  beside a paper, cannot be told from a guess. The source is shown under the
  example's name, so an arch scaled from a published span and one scaled to a
  round number for the drawing's sake are distinguishable on screen.
  `tools/setscale.js` writes the block, computing the factor from a declared
  span.

- `tools/reproduce/`, the generators behind every computed figure and table of
  the article, with `REPRODUCING.md` stating the expected values.

### Changed

- **Changing the unit system converts, rather than relabelling.** It used to
  change the labels alone, so an arch of 2 m became "2 mm" — a different arch,
  with nothing on screen to say so, because every readout agreed with every
  other about a number whose meaning had silently changed.

  Lengths, areas, weights, the force polygon, the pole, the traced curves, the
  profiles, the picked ends and reference points, and the typed fields — unit
  weight, thickness, ring radius, reference length, load magnitude — are all
  carried across. **Three factors are involved and they are not
  interchangeable**: a length goes as *k*<sub>L</sub>, an area as
  *k*<sub>L</sub>², a force as *k*<sub>F</sub> — a separate factor, since the
  systems choose their force unit independently of their length unit — and a
  weight density as *k*<sub>F</sub>/*k*<sub>L</sub>³, a millionth between SI and
  N–mm.

  What the tests pin down is not the arithmetic but that **the mechanics does
  not move**: the line of thrust crosses every joint at the same fraction and
  the collapse band is the same fraction of the total weight, in every system.
  An independent check falls out of the unit tables themselves — each system
  declares a typical masonry density in its own units, so converting one into
  another must land on the tabulated value, which fixes
  *k*<sub>F</sub>/*k*<sub>L</sub>³ without trusting the code that computes it.

  Unit weight is converted rather than reset to the typical value, which used
  to discard whatever had been entered.

### Fixed

- **A narrow admissible band could be missed entirely.** The collapse search
  stopped at the first sample of a sixty-step grid that happened to be
  admissible, which tests a boolean on a grid: a band narrower than the grid
  step falls straight through it, and an arch that stands was reported as
  standing at no thrust at all. The seed now follows the maximum of the
  clearance, which is continuous, and zooms in on it.

- **H min and H max did not reach the states they name.** The thrust slider
  stepped in whole per cent, so the button asked for 4.24 % of the travel and
  got 4 %; the least clearance then came out above the tolerance that counts as
  touching, and the panel answered "once hyperstatic" to a press of **H min**.

- **The mechanism verdict and the collapse band went stale on changing
  example**, both being refreshed only on the branch that drives from the
  thrust.

- **An example with neither joints nor stored springings crashed the update**
  in the middle of a redraw, leaving the previous arch and its verdicts on
  screen — worse than an empty plot.

- **Six examples could not be analysed at all**, having been saved before a
  line of thrust was computed: the consistency check treated "no stored
  solution" like "a stored solution that does not match", and disabled the
  thrust slider on arches it had the blocks, the weights and the joints for.

- The subscript in *Thickness ratio t/rᵢ* was pushed to the far side of the
  panel, `label.inline` being a flex row with `space-between`.

## [1.1.0] — 2026-08-28

The first published version: interactive graphical statics of masonry arches in
the browser, as plain ES modules with no build step and no dependencies.

Tracing from a photograph, whole-profile tracing for sections the two faces
cannot describe, scale and units, applied point loads, the three degrees of
freedom of the line of thrust, admissibility joint by joint, hinge formation
and the collapse mechanism with its kinematics, Poleni's dome by Pappus'
theorem, a three-dimensional block view, both ends imposed by the classical
trial-pole construction, Bow's notation, Hooke's cable, and a session saved to
and reopened from a single JSON file.
