# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **A chequered scale bar on both plots**, bottom right, hidden or shown with
  *Scale bar* in the toolbar. The value is always round — 1, 2 or 5 times a
  power of ten, off the same ladder the axis ticks use — and follows the zoom.
  On the arch it measures a length, in the unit system chosen in the toolbar or
  in `px` while the arch is unscaled; **on the force polygon it measures a
  force**, because the load line is the weights laid end to end and the pole's
  abscissa is the horizontal thrust, so every length on that drawing is one.
- **An exact circular ring from its numbers** — inner radius, thickness ratio,
  voussoirs — in the Geometry panel. `circularArch()` had existed since the
  port but nothing outside the tests called it, so the ring the published
  figures are computed on could not be built in the browser at all: a reader
  checking a point of them had to trace two arcs over an image by hand, which
  does not give the same numbers. Measured against the published data, the band
  now agrees to within the figure's own grid step.
- `tools/reproduce/`, the generators behind every computed figure and table of
  the paper, with `REPRODUCING.md` stating the expected values.

### Changed

- **The unit menu now converts instead of relabelling.** It used to change the
  labels alone, so an arch of 2 m became "2 mm" — a different arch, with
  nothing on screen to say so, because every readout agreed with every other
  about a number whose meaning had silently changed. `convertLength` and
  `convertForce` had been written for this and were never called by anything.

  Lengths, areas, weights, the force polygon, the pole, the traced curves, the
  profiles, the picked ends and reference points, and the typed fields — unit
  weight, thickness, ring radius, reference length, load magnitude — are all
  carried across. **Three different factors are involved and they are not
  interchangeable**: a length goes as *k*<sub>L</sub>, an area as
  *k*<sub>L</sub>², a force as *k*<sub>F</sub> — which is a separate factor,
  because the systems choose their force unit independently of their length
  unit — and a weight density as *k*<sub>F</sub>/*k*<sub>L</sub>³, a factor of
  a millionth between SI and N–mm.

  The property the tests pin down is not the arithmetic but that **the
  mechanics does not move**: the line of thrust crosses every joint at the same
  fraction and the collapse band is the same fraction of the total weight, in
  every system. An independent check falls out of the tables themselves — each
  system declares a typical masonry density in its own units, and converting
  one into another must land on the value already tabulated, which fixes
  *k*<sub>F</sub>/*k*<sub>L</sub>³ without trusting the code that computes it.

  Unit weight is now converted rather than reset to the typical value, which
  used to throw away whatever the student had entered.

### Fixed

- The subscript in *Thickness ratio t/rᵢ* was pushed to the far side of the
  panel: `label.inline` is a flex row, so the bare text and the `<sub>` became
  two items and `space-between` drove them apart.

## [1.1.0] — 2026-08-28

### Added

- **The joints of a stored example are recovered from its voussoirs**
  (`core/joints.js`). The converted MATLAB files never carried the cuts
  between the blocks, and without them admissibility and the whole mechanism
  analysis had nothing to work on: on every one of the twenty-eight shipped
  examples the panel read *"available for a traced arch, which has joints"*,
  the Mechanism tab stayed empty, and **H min** and **H max** did nothing. The
  features the software exists for were reachable only by tracing a photograph
  from scratch. Twelve of the examples now open the whole analysis.
- Where the blocks are not a chain of abutting voussoirs the recovery refuses
  and **says which examples and why** — the Poleni domes flattened their
  two-piece blocks and interleaved the two shells; the Amiens and San Francesco
  sections carry piers and detached members. Those are reachable through *trace
  a whole profile*, which builds proper joints from the outline.
- `npm start`: a static server for `docs/` in the standard library and nothing
  else, because ES modules are refused over `file://`.
- `CITATION.cff`, `codemeta.json`, `CONTRIBUTING.md`, and a test workflow
  across three operating systems and three versions of Node.
- Fourteen tests for the recovery, including a round trip against
  `blocksBetween`, which builds both the blocks and the joints so the recovery
  can be checked against a known answer rather than against itself.

### Fixed

- **`collapseRange` could miss a narrow admissible band entirely.** It stopped
  at the first sample of a sixty-step grid that happened to be admissible,
  which tests a boolean on a grid: `Ctesifonte_01` stands only between
  *H*/*W* = 0.041 and 0.061, the grid samples 0.0397 and 0.0593, and a real
  arch was reported as standing at no thrust at all. The seed now follows the
  maximum of the clearance, which is continuous, and zooms in on it.
- **H min and H max did not reach the states they name.** The thrust slider
  stepped in whole per cent, so the button asked for 4.24 % of the travel and
  got 4 %; on `Example_3_Heyman_arch` the least clearance then came out at
  0.026, above the 0.02 that counts as touching, and the panel answered *"once
  hyperstatic"* to a press of **H min**. The slider's step is now 0.01.
- **Six examples could not be analysed at all.** They were saved before a line
  of thrust was ever computed, and the consistency check treats "no stored
  solution" like "a stored solution that does not match": the thrust slider was
  disabled and the panel said *"not available for this example"* about an arch
  it had the blocks, the weights and the joints for. Nothing was missing but a
  pole, which the mechanism search computes for itself. The Nervi bridge now
  gives four hinges and a one-degree collapse mechanism.
- **An example with neither joints nor stored springings crashed the update.**
  `funicular` was handed `null` for the point to start walking from and threw
  in the middle of the redraw, so the drawing kept the previous arch and the
  panels kept the previous arch's verdicts — worse than an empty plot. It now
  returns an empty line, and the panel says to pick both ends or trace the arch.
- **The collapse band was inherited from the previous arch.** It is recomputed
  from a signature, but an arch without joints never reaches that branch and
  kept whatever band was last on screen.
- **The mechanism verdict went stale on changing example.** It was reported
  only on the branch that drives from the thrust, so choosing a Poleni dome
  after a Heyman arch went on saying *"isostatic — three hinges"* about an arch
  the panel had no joints for.

## [1.0.0] — 2026-08-15

The first browser version: the whole MATLAB application ported to plain ES
modules with no build step and no dependencies, checked against the twenty-eight
converted examples. Tracing, scale and units, applied loads, three degrees of
freedom, admissibility, hinges and the collapse mechanism, Poleni's dome, the
3-D block view, both ends imposed, whole profiles, Bow's notation, Hooke's
cable, and save and reopen.
