# The geometric core

Plain ES modules, no dependencies and no build step. The browser loads these
files directly, so the source you read is the source that runs.

```bash
npm test          # node --test tests/*.test.js
```

| Module | What it holds |
|---|---|
| `geometry.js` | polygon area and centroid, line intersection, point-in-polygon |
| `blocks.js` | block features, the sort order, the merge with applied forces, the circular-arch generator |
| `statics.js` | force polygon, funicular polygon, line of thrust, Hooke's cable |
| `model.js` | loading a saved example, recovering the pole, the consistency check |
| `joints.js` | recovering the cuts between the voussoirs of a stored example |
| `trace.js` | turning two traced curves into voussoirs |
| `units.js` | scale from a reference length, unit systems, formatting |

## The construction

The weights of the voussoirs, taken in order from one springing to the other,
are laid end to end down a vertical **load line**. A point off that line, the
**pole**, is joined to every division of it; those segments are the **rays**.
Back in the drawing, starting from a springing, one walks a segment parallel to
the first ray until the vertical through the first block centroid, turns onto
the second ray, and so on. The result is the **funicular polygon**, and for an
arch it is the **line of thrust**.

Moving the pole away from the load line raises the horizontal thrust and
flattens the line. That one degree of freedom, plus the two free ends, is the
$\infty^3$ of possible equilibrium states the tool exists to make visible.

## What was verified against MATLAB

Every formula was checked against the twenty-eight converted examples, each of
which carries the solution the MATLAB app computed.

- **Areas and centroids** reproduce `A_Blocks` and `xyg_Blocks` on every
  example, to a relative $10^{-9}$.
- **The force polygon** reproduces `Force_Funicolar_Polygon` exactly. Its three
  columns are the weight, the ray to the division below the block, and the ray
  to the division above it, so column 3 of a row equals column 2 of the
  previous one — a property the tests assert independently.
- **The funicular polygon** reproduces `LOT_xy` point by point, to a relative
  $10^{-8}$.

Two findings from that exercise are worth knowing.

### The gap parameter is zero

The MATLAB routine offsets each successive ray by a `shrink` term, so that the
force polygon can be drawn with the rays separated for legibility. Fitting
`shrink` as a free parameter across the examples returns zero every time, and
the residual drops to machine precision. The core therefore does not carry it;
if the drawing ever needs separated rays, that is a rendering concern and does
not belong in the statics.

### The stored pole cannot be trusted

`xy_Pole_Def` holds the final pole in some examples and a stale value with
`x = 0` in others, while `xy_Pole_Prime[1][0]` always agrees with the polygon.
Rather than choose between two unreliable fields, `poleFromForcePolygon()`
recovers the pole from the polygon itself: two rays through known divisions of
the load line determine it, and subtracting the two equations removes the
unknown abscissa and leaves the ordinate linearly.

## Consistency: six examples do not match themselves

`consistency(model)` answers whether the stored solution belongs to the stored
geometry. **Six of the twenty-two solved examples fail it**, for two distinct
reasons:

- **applied point loads** were merged into the sequence, and the loads
  themselves were never saved by the MATLAB app, so the solution cannot be
  recomputed from the file — only displayed as stored
  (`Ctesifonte_02`, `Example_7_San_Francesco`, `Poleni_Example_thickness`);
- **a stale solution**: the counts agree, but the first column of the force
  polygon does not match `W_Blocks`, because a specific weight or a thickness
  was changed after the polygon was drawn
  (`Poleni_Example_04`, `Poleni_Example_05`, `prova`).

The application must show a warning on these rather than redraw them, and a
test asserts that all six are detected. If that count ever moves, the data has
changed and the warning path needs looking at.

## The joints were never stored: `joints.js`

Admissibility and the whole mechanism analysis are asked one question — where
does the line of thrust cross each joint — and a joint is the only thing the
twenty-eight converted files do not carry. `Blocks_coordinates_4_points` holds
the voussoirs; the cuts between them were never written to the `.mat`. So on
every stored example `jointCrossings` had nothing to cross: the admissibility
panel read *"available for a traced arch, which has joints"*, the Mechanism tab
stayed empty, and **H min** and **H max** did nothing. **The features the
software is for were reachable only by tracing a photograph from scratch.**

They are recoverable from the polygons. Blocks *k* and *k+1* touch along one
face; every vertex of either that lies on the boundary of the other is a point
of that face, and the joint is the segment between the two furthest apart.
Taking the extremes rather than one shared edge is deliberate — it is the
convention `cutRadially` already uses, where a cut through a double shell runs
"from the first material entered to the last left" with the voids inside it, so
a recovered joint means what a built one means.

**The two springings abut nothing**, and are found from the one joint each end
block does have. The end face is the material furthest away measured **along**
the arch — the component on the normal to that joint, not the raw distance from
it. Measuring the raw distance instead picks the extrados face on any voussoir
wider than it is long, which is most of them; that was the first attempt, and it
laid a springing joint along the back of the arch.

Two things learned by running it:

- **A voussoir is rarely square to its joints.** On the Heyman arch the two ends
  of the springing face sit at 63 % and 100 % of the block's reach along the
  arch, so a narrow band around the far end keeps one of them and leaves nothing
  to draw a joint between. The band is half the reach; the two vertices of the
  joint it started from lie at zero.
- **The looser tolerance must not be a fallback.** A hand-traced example does
  not close to floating point, so a loose pass runs beside the strict one — but
  taking it only when the strict one finds *nothing* fails at the apex of
  `Example_6_Pointed_Arch`, where the two faces are half a pixel apart: the
  strict pass caught the single vertex pair inside its tolerance, returned a
  joint 0.15 units long across a ring 10 units thick, and having succeeded kept
  the looser pass from ever running. The longer of the two is kept.

`orientJoints` puts the intrados end at `a`, because `jointCrossings` reports 0
there and the whole of `mechanism.js` reads it that way; getting it backwards
does not throw, it reports hinges on the wrong face and animates the mirror of
the real mechanism. Each joint is first aligned with the one before it so the
chain cannot cross over itself, then the two chains are compared and the shorter
is taken as the intrados, which it is for any ring.

### What is refused, and why that is the right answer

| | |
|---|---|
| **12** of the examples recover a whole chain | and open the whole analysis |
| **11** interleave two shells | the Poleni domes flattened their two-piece blocks to one polygon each, so ordering by centroid *x* — which is the application's convention everywhere — does not give the ring order |
| **3** are not a single ring | Amiens and San Francesco carry piers and detached members; the Utah arch has a real gap, 13 % of the diagonal, between two blocks |

A degenerate joint is refused as loudly as a broken chain: a cut with no length
is read as a crossing at an arbitrary fraction and reported as a hinge that is
not there. All of these sections remain analysable through **trace a whole
profile**, which cuts the outline radially and builds proper joints, multi-piece
ones included.

The round trip is what the tests turn on: `blocksBetween` builds both the blocks
and the joints, so throwing the joints away, recovering them from the blocks
alone, and comparing against the ones discarded checks the recovery against a
known answer rather than against itself. It agrees to a millionth of the ring
thickness on every ring tried.

## Tracing

`trace.js` is the other way into the pipeline: instead of loading a saved
example, the student loads a photograph, traces the intrados and the extrados,
and asks for N blocks. `blocksBetween()` resamples both curves and builds the
quadrilaterals; everything downstream is unchanged.

Two traps it closes, both of which fail silently otherwise.

**Resampling is by arc length, never by x.** On a semicircular arch the two
differ enormously near the springings, and spacing by x gives voussoirs that
grow without bound as the tangent turns vertical.

**A reversed extrados is detected and corrected.** Tracing one curve
left-to-right and the other right-to-left produces bow-tie blocks: every
quadrilateral self-intersecting, every area wrong, and no error message.
`sameDirection()` compares end-to-end distances and `blocksBetween()` reports
whether it had to flip.

`checkTrace()` reports the rest before anything is drawn. Its crossing test
looks at the SIGN of the signed areas, not their size: where the extrados dips
inside the intrados the quadrilateral reverses its orientation, and an
inverted block can be just as large as a good one. A test for small areas
misses the case completely -- which it duly did, on the first attempt.

## Scale and units

Until an arch is scaled, every number it produces is in pixels. `units.js`
turns one measurement — two picked points and the distance between them — into
physical units, and rescales the whole model.

**Lengths go as k, areas as k², weights as k² or k³.** Which of the last two
depends on whether the out-of-plane thickness is a physical quantity the user
typed or a pixel count, and `scaleModel()` takes it as an argument rather than
guessing. Getting it wrong is a silent factor of the scale: treating a typed
thickness of 1 m as pixels once produced an arch 25 mm thick and a horizontal
thrust of 1.8 kN — arithmetically correct and physically absurd.

**The specific weight is a WEIGHT density**, so that `W = area x thickness x
gamma` with no hidden g. The MATLAB app instead takes a mass density and
multiplies by `Unit_Mass_to_Weight` (10 for SI, 10000 for N-mm); the factors
are recorded in `MATLAB_MASS_TO_WEIGHT` for reading old files, but new work
uses the unambiguous convention.

`archDimensions()` reports span, rise and their ratio, which is the quickest
check that the reference was picked correctly: if the span of a bridge comes
out as three metres, the reference distance was wrong.

## Applied point forces

`blocksLike()` merges applied loads into the block sequence: a force becomes a
block with no area and no outline, whose weight is the force magnitude and
whose centroid is its point of application. From the funicular's point of view
a load at a station is a load at a station, and treating the two alike is far
simpler than special-casing forces in the construction.

The merged sequence is re-sorted by x, so a load inserts itself wherever it
acts, and the thrust line gains one vertex. Adding a load at the crown of a
semicircular arch drives the line out through the haunches immediately, which
is the point.

**The pole's ordinate does not move when a load is added.** For a stored
example it is the one recovered from the saved force polygon, and shifting it
would stop the app reproducing that example at the middle of the slider — a
regression that is easy to introduce and invisible without checking. The live
app reproduces `Example_3_Heyman_arch` to a relative 1.4e-16 with the slider
centred.

## Admissibility: does the line stay in the masonry?

`jointCrossings()` reports, for every joint, where the thrust line crosses it
as a fraction `s`: **0 at the intrados, 1 at the extrados**. Anything outside
[0, 1] is a joint where the line has left the ring, and no equilibrium is
possible in that configuration. If it stays inside everywhere, the safe theorem
says the arch stands.

**Choosing the right crossing is not trivial.** A joint near a springing is
almost horizontal, and its infinite line meets segments of the thrust line far
away that have nothing to do with it. Taking the first candidate gave crossings
that were not even symmetric on a symmetric arch. The function now collects
every candidate whose intersection falls within a thrust-line segment and keeps
the one that lies within the joint — or, failing that, the one that misses by
least.

### Both ends are free, and this is what it was worth

The tool used to pin both ends of the thrust line at the mid-points of the end
joints, leaving only the thrust free. That one-parameter family is far more
demanding than the full $\infty^3$, and the tool rejected rings that Heyman's
criterion accepts.

`freeThrustLine` restores the other two degrees of freedom:

| parameter | what it is | where it lives |
|---|---|---|
| pole abscissa | the horizontal thrust | *Horizontal thrust* slider |
| start fraction $s$ | where the line leaves its springing joint, 0 at the intrados, 1 at the extrados | *Start on the springing joint* |
| pole ordinate | how the total weight divides between the two reactions | *Reaction at that springing* |

The far end is not a fourth parameter: it *follows*. The last ray is carried on
until it meets the other joint, and where it lands is reported.

**The end used not to reach its joint at all.** `funicular` stops on the
vertical through the far springing, wherever the last ray happens to cross it.
Asking where that line crosses the far joint therefore returned the meeting of
the joint's *infinite* line with some unrelated segment — on a semicircular
arch it read $s = -14$, and the joint was scored as a failure whatever the
line did. That, not the pinning alone, is why the old criterion was so strict.

Measured on semicircular rings, 16 blocks, by bisection on $t/r_i$:

| ends | least admissible $t/r_i$ |
|---|---|
| pinned at the joint mid-points | 0.198 |
| both free | **0.115** |

Heyman's figure for a continuous ring is $0.108$. The limit line the search
finds on its own is the textbook one: it leaves the springing at the
**extrados**, arrives at the other springing at the **extrados**, and needs a
thrust of about $0.20$ of the total weight. Refining the subdivision moves the
figure slightly upwards (0.115 at 16 blocks, 0.118 at 32, 0.123 at 64) — a
coarse funicular polygon cuts corners that a fine one cannot.

Freeing the ends *enlarges* the family rather than replacing it: at $s = 1/2$
with the pole ordinate at half the load, `freeThrustLine` reproduces
`funicular` vertex for vertex, and a test asserts it. `funicular` itself is
untouched, because the fifteen consistent MATLAB examples are reproduced
through it.

### Saving a session

`persist.js` writes the whole session to one JSON file: the traced curves, the
blocks and joints, the weights, the applied forces, the scale and unit system,
and the three numbers above. Everything derivable — force polygon, thrust line,
joint crossings — is left out and recomputed on opening, so a file stays
readable when the mechanics is corrected. The background image is left out too:
photographs run to megabytes, so the file records the image's *name* and the
student loads it again.

A file is validated before it is trusted (`n` weights against `n` blocks,
`n + 1` joints, a magnitude for every force) and refused with a sentence that
says what is wrong, rather than half-loaded into a model that would go on to
draw a thrust line that is simply wrong with nothing on screen to say so.

The property the tests check is not that the fields came back but that the
*mechanics* did: a model put through JSON gives a thrust line identical to the
original vertex for vertex, and that was confirmed in the browser through the
real file-input path — largest difference over the whole line, exactly zero.

## Checking that the axes are really equal

`axis equal` is the one property of the drawing that **cannot be checked by
looking at it**: a ten per cent anisotropy is invisible and falsifies every
length read off the picture. So it is measured, not assumed.

From the console:

```js
aLOT.scales().ratio   // must be exactly 1
```

Two properties pin it down, and both are covered by tests:

- `fit()` yields equal scales for any box and any data bounds;
- a traced semicircular ring has **rise/span = 0.5** exactly, for every radius
  and every subdivision, so any departure is a transform problem rather than a
  geometry one.

The failure this guards against was subtle. `fit` establishes the equal aspect,
but the box can change shape afterwards — a window resize, or a scrollbar
appearing once the panel grows — and until the next frame the view still has
the old aspect. A pointer position converted through that stale transform lands
in the wrong place, so a traced semicircle came back with a rise-to-span of
0.548. `syncSize()` now re-equalizes the instant it notices the box has
changed, and the pointer handlers call it before converting.

## Conventions

- A point is `[x, y]`, a direction `[dx, dy]`, a polygon `{x: [...], y: [...]}`
  exactly as it arrives from the converted examples.
- Blocks are ordered by centroid $x$, **descending**, as MATLAB's
  `sort(..., 'descend')`. Reversing it does not throw: it silently produces a
  thrust line running the wrong way that closes nowhere near the far springing.
- An applied force is carried as a block with no area and no outline, whose
  weight is the force magnitude. From the funicular's point of view a load at a
  station is a load at a station, and treating the two alike is much simpler
  than special-casing forces later.
- Coordinates are in the frame declared by `_frame` in the data. **Read it;
  never assume.** See `../data/README.md`.

## Hinges and the collapse mechanism

`mechanism.js`. The rule is that the line of thrust cannot leave the ring:
where it would, it stays hooked at the intrados or the extrados between two
voussoirs, and that point is a hinge. Counting the two springings as hinges
throughout, `h` hinges carry `h - 1` bodies and the whole count is `h - 3`:

| interior hinges | h | b | 3b − 2h | state |
|---|---|---|---|---|
| 0 | 2 | 1 | −1 | once hyperstatic, not determined |
| 1 | 3 | 2 | 0 | isostatic, the three-pin arch |
| 2 | 4 | 3 | +1 | a mechanism |

### The search is what makes hinges appear

`bestLineForThrust` fixes the thrust and maximises the least clearance from the
two faces over the other two parameters. At the middle of the admissible band
the best line runs clear of everything; pushed towards either end it is
squeezed against the faces until it touches. Nothing has to be told where the
hinges are.

Driven this way a semicircular ring reproduces the classical patterns: **five**
hinges at minimum thrust — springings, intrados at the haunches, extrados at
the crown — and **four** at maximum thrust. A test asserts both.

### A narrow band falls through a boolean grid

`collapseRange` scans for something admissible and then bisects outwards. The
scan used to stop at the first sample that fitted, which tests a **boolean** on
a grid: a band narrower than the grid step falls straight through it.
`Ctesifonte_01` is that case. It stands only between *H*/*W* = 0.041 and 0.061,
the sixty-step grid samples 0.0397 and 0.0593, and the clearance reads

```
   f      0.0397    0.0593
   c     -0.0048   -0.0047
```

— missed by a hair on both sides, and a real arch reported as standing at no
thrust at all, with the Mechanism tab dead. The **clearance itself is
continuous** and its maximum is resolved by the same grid, so the seed follows
the maximum down instead and only gives up when a local zoom cannot lift it
above zero. A test pins the example down.

### A contact run is not always one hinge

**This was wrong at first and the arithmetic hid it.** The tolerance for
touching is a fraction of the joint, so on a thick ring — where the joint is
long — a whole stretch can fall inside it. Grouping consecutive joints on the
same face into one hinge then merged two real contacts into one, reported three
hinges instead of four, and called the collapse state *isostatic*.

Measured on a semicircular ring at `t/ri = 0.25` and maximum thrust, joints 5
to 11 are all within tolerance, but the clearance reads

```
0.0172   0.00004   0.0014   0.0043   0.0014   0.00004   0.0172
```

— two contacts, at joints 6 and 10, with the crown standing clear between them.
A run is therefore split at any interior local maximum that rises to more than
twice the flanking contact: enough to separate a genuine return off the face,
not enough for a numerical wobble to manufacture a hinge. Both directions are
tested.

### The kinematics, and why it is integrated

The velocity field is assembled and its null space taken: three unknowns per
body, two equations per hinge, a hinge to the ground setting the velocity there
to zero. Solving generally rather than applying Kennedy's theorem case by case
costs a few lines and handles the five-hinge minimum-thrust state — two degrees
of freedom — without a second code path. A test checks the general solve
against Kennedy's construction on a chain whose centres are known by hand.

**Instantaneous centres are instantaneous.** Turning each body about its centre
by a *finite* angle keeps the bodies rigid but opens the hinges at second
order: on a chain of span 8, an amplitude of 0.2 rad opens them by 0.14, which
is plainly visible. `displacedConfiguration` therefore integrates — at every
step the velocity field is re-solved for the current hinge positions and each
body is advanced a little about its current centre. Every body undergoes a
composition of rigid transforms, so it stays *exactly* rigid, while the
residual hinge opening falls like `amplitude² / steps`:

| amplitude | one rotation | 120 steps |
|---|---|---|
| 0.05 | 9.0e-3 | 7.4e-5 |
| 0.2 | 1.4e-1 | 1.2e-3 |
| 0.4 | 5.7e-1 | 4.6e-3 |

At the amplitudes the interface allows, that is well under a pixel. The
supports do not drift at all (1e-15). Tests pin down both properties, and one
of them asserts that a single rotation *does* open the hinges — so that anyone
tempted to simplify the integration away sees what it costs.

### Masonry cannot pass through itself

The sign of a null-space vector falls out of the elimination, not out of the
mechanics, so half the time the mechanism came back running **backwards** —
blocks driving into one another instead of coming apart. A hinge sits at one
face of its joint and the joint has to open at the *other*: `separationSense`
measures the opening rate at that far end for every interior hinge and takes
the sign from it. Each hinge therefore carries two extra things, set when it is
found: `opposite`, the far end of its joint, and `along`, the direction from
the body before the hinge to the body after.

The integration needs the same care a second time. The null space is recomputed
at every step and its sign can flip between steps; left alone the arch judders
back and forth instead of opening. Each step is aligned with the one before it.

**Some hinge patterns have no good sense at all**, and that is not a defect in
the solver. On a symmetric ring at maximum thrust the two haunch hinges both
fall on the intrados, and Kennedy puts the crown body's centre on the axis — so
it *turns* instead of dropping, and one haunch opens exactly as the other
shuts:

```
H min   5 hinges  dof 2   openings   0.14   0.08   0.03      a real mechanism
H max   4 hinges  dof 1   openings   0.16  -0.17             cannot run
```

`separationSense` returns 0 there, `analyse` reports `kinematic: false`, and the
panel says the pattern would need the masonry to interpenetrate rather than
animating something impossible. **A positive degree of freedom is not by itself
a collapse mode**; the joints have to be able to open.

## Poleni's dome: `dome.js`

A barrel vault cut into voussoirs gives blocks of constant width, and a block
weighs its area times that width. A **dome** cut into lunes gives nothing of
the sort: each lune is bounded by two meridian planes, so its width is
proportional to the distance from the axis — broad at the major parallel,
closing to nothing at the crown. That is what Poleni saw in 1748, and it is why
a dome is not an arch.

**The weight of a lune block is exact, by Pappus:**

```
V = A · θ · r̄
```

with `A` the area and `r̄` the distance of the *centroid* from the axis. It
needs nothing the model does not already carry. The MATLAB app instead summed
`bounding-box area × the radius of one vertex × dθ` over the revolution, which
is neither exact nor the same quantity; the tests here check `luneVolume`
against the closed-form annular wedge, `θ/2 · (r₂² − r₁²) · h`, to 1e-12.

The mechanical consequence, measured on a semicircular ring of 16 equal blocks
at a 15° slice: the springing block's share of the total weight rises from
**6.25 % to 9.75 %**, and the crown block's falls from **6.25 % to 0.96 %**. The
line of thrust moves accordingly — which is the entire point.

### The axis, and a trap in defaulting it

The axis defaults to the vertical through the mid-point of the two springings,
right for any symmetric arch. A **stored example may carry no springings**, and
defaulting to `x = 0` there put the axis off the edge of a plate traced in pixel
coordinates: `Poleni_Example_01` spans x from 35 to 1744, so every lune came out
far too wide. `defaultAxis` therefore falls back to the middle of the blocks,
and the app re-applies it whenever a model arrives from anywhere but the tracer.

### Scaling

A lune's width is a **length**, so its weights go as `k³` where a
constant-thickness arch goes as `k²`. Rather than carry a second scaling rule,
the app re-weighs from the scaled geometry after every change of scale — and
scales the axis coordinate with it.

## The block view: `render/solid.js`

The second pane carries two tabs, the force polygon and the block arch in three
dimensions, as the MATLAB app's `ForcePolygonFPTab` and `DViewTab` did. No
WebGL and no library: an orthographic axonometric projection and the painter's
algorithm, which is all a few hundred convex quadrilaterals need. The viewpoint
follows MATLAB's `view([-45 - angle/2, 30])`, so the two versions show the same
picture from the same corner.

The projection frame is orthonormal — `u`, `v` and `d` are unit and mutually
perpendicular — so lengths lying in the plane of the screen come out at their
true size. That is the three-dimensional counterpart of `axis equal`, and a
test asserts it rather than trusting the algebra.

Faces are sorted on the depth of their centroid. The painter's algorithm can be
fooled by long interpenetrating faces; voussoirs are small convex pieces that
do not overlap, so it is exact here and costs one sort.

## Imposing both ends: `poleForEnds`

A student may fix where the line of thrust starts and where it ends. The
classical way is a trial pole and a correction, and the MATLAB version drew it:
a preliminary funicular from A, the closing error, and the pole projected onto
the vertical (`xy_Pole_Prime` to `xy_Pole_Def`).

**It is a correction, not a search.** At a fixed thrust the height the funicular
reaches over B's abscissa is exactly *affine* in the pole ordinate — each
segment's slope is `(yO − s_j)/xO`, so

```
y_end = y_A + ( yO (x_B − x_A) − Σ s_j dx_j ) / xO
```

with derivative `(x_B − x_A)/xO`. Measured against the code before any of it
was written: the slope matches to ten significant figures and the residual
after one linear step is 10⁻¹⁵. Anything iterative here would be a
misunderstanding, and a test asserts the point directly — **three very
different trial poles give the same answer**.

The trial the application uses is whatever the sliders are currently asking
for, so moving the reaction slider stretches the correction while the final
pole stays put. That is the property worth seeing, and it is on screen.

## Whole profiles: `profile.js`

Two traced faces describe a ring of even thickness and nothing else. For a
filled haunch, a widening pier, or the two shells of St Peter's dome, the
student traces the **outline** instead — as many closed curves as the section
needs — and the joints come from rays out of a picked centre.

**A block may be several pieces.** A radial cut through a double shell passes
through masonry, air, and masonry again, so one voussoir is two disjoint
polygons. Blocks carry an optional `pieces` array and are read through
`piecesOf`, `blockArea` and `blockCentroid` in `geometry.js`; a block without
pieces is its own single piece, indistinguishable from what the tracer has
always produced. Area and centroid are additive, so the mechanics is unchanged
— but the centroid must be **area-weighted over the pieces**, because taking
the first alone would put the weight at the wrong radius, and for a dome that
is the quantity everything turns on.

Two traps, both found by running it:

- **The determinant's sign.** `s d − u e = p − centre` solved by Cramer has
  determinant `ex dy − dx ey`. With the sign the other way round every distance
  comes out negative, the forward-hit filter discards them all, and the ray
  finds nothing at all.
- **The extreme cuts lie in the end faces.** A section traced as a closed
  outline ends in radial faces, and the first and last rays run exactly along
  them — parallel lines never meet, so those cuts found no material and the two
  end voussoirs went missing. The auto-derived range is inset by a millionth of
  the span, far below anything measurable.

Where a cut crosses several shells the joint spans from the first material to
the last, with the gaps inside it; the material itself is carried in
`segments`. Admissibility therefore treats such a cut as continuous, which is
the one place this is still approximate.
