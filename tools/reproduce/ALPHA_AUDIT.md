# Static–kinematic multiplier audit

The reported gap is not evidence of a different physical model. On the same
discrete rings, equilibrium at the actual voussoir joints reproduces the
kinematic multiplier to floating-point precision. The graphical admissibility
test can reject those very same equilibria.

## Reproduction

```sh
node tools/reproduce/checkalpha.js
```

No dependencies. The static calculation independently enumerates the vertices
of a four-variable linear programme; it does not use the kinematic solution or
its hinges. The script asserts agreement within `1e-9` and checks an explicit
feasible equilibrium at alpha = 0.41. An additional check using SciPy/HiGHS
gave the same optima, within 2e-15 of the kinematic results.

The geometry is `circularRingCase`, inner radius 1, specific weight 20 and unit
depth. Joints are counted from zero, starting at the right springing. Contact
admits compression and unrestricted shear, with no sliding or tensile stress.

| Voussoirs | t/ri | Kinematic alpha | Static equilibrium alpha |
|---:|---:|---:|---:|
| 8 | 0.30 | 0.440703365383 | 0.440703365383 |
| 12 | 0.30 | 0.443603891842 | 0.443603891842 |
| 16 | 0.30 | 0.437247356579 | 0.437247356579 |
| 24 | 0.30 | 0.432256686021 | 0.432256686021 |
| 32 | 0.30 | 0.431228287792 | 0.431228287792 |
| 16 | 0.20 | 0.238531945186 | 0.238531945186 |
| 16 | 0.50 | 0.739049749901 | 0.739049749901 |

## What the static calculation enforces

Let Rx, Ry be the reaction on the right springing and M its moment about the
origin. For each joint, sum the loads of precisely the voussoirs between the
right springing and that joint. With SW = sum(W), SX = sum(W*x), SY = sum(W*y),
the moment about an endpoint p=(x,y) is

```
m_j(p) = M - x*Ry + y*Rx - SX + x*SW + alpha*(y*SW - SY).
```

For this joint orientation, impose `m_j(a) >= 0` at the intrados and
`m_j(b) <= 0` at the extrados. The difference of these inequalities also
enforces nonnegative normal compression. These are linear constraints in
Rx, Ry, M and alpha. Maximising alpha gives the static optimum without a grid
search or a graphical crossing criterion.

For n=16 and t/ri=0.30, a certificate at alpha=0.41 is

```
[Rx/Wtotal, Ry/Wtotal, M/Wtotal, alpha]
[-0.3932952373810612, 0.5696719051857723, 0.736594329946497, 0.41]
```

The script verifies every joint constraint for this certificate. The current
`collapseRange` with `search: {grid: 31, rounds: 4}` nevertheless returns null
at alpha=0.41.

## Cause of the false rejection

`bestLineForThrust` in `docs/app/js/core/mechanism.js` obtains its clearance from
`jointCrossings` in `docs/app/js/core/statics.js`. The latter intersects a joint
with every **finite geometric segment** of the funicular, then chooses a
crossing inside the joint, or the one missing it by least. It does not associate
the joint with the resultant of the correct set of voussoirs.

With inclined loads, the intersections of successive lines of action can lie
outside their respective voussoirs. The funicular can double back, and the
correct joint resultant must be evaluated on its line of action, including its
extension. A geometric intersection with another funicular segment represents
a different cumulative load and cannot establish that joint's admissibility.

At the exact limiting equilibrium for n=16, t/ri=0.30:

* The mechanism hinges are 0 extrados, 5 intrados, 10 extrados, 16 intrados.
* Joint 5 has its correct pressure resultant at s=0, the intrados hinge.
* The graphical check instead selects segment 6 and reports s=-0.04480333.
* It also falsely rejects joints 4 and 15.

The audit feeds this exact equilibrium into the existing graphical checker,
so this counterexample is independent of its search resolution. Refinement
cannot repair an incorrect admissibility criterion. Stabilisation of the gap
with increasing numbers of voussoirs cannot identify a physical model mismatch.

The optional `--graphical` flag also bisects the current graphical search's
reported limit using its default settings. Those settings are not claimed to
be the ones used for the percentages in the paper; the paper's alpha-generation
script and macro values were not present in this checkout.

## Suggested replacement for the paper passage

> Comparing the original graphical static search with the independent
> kinematic calculation initially produced a gap that persisted under mesh
> refinement. An equilibrium-based audit traced the discrepancy to the static
> admissibility check: for inclined loads, geometric intersections with the
> funicular can select a segment carrying the wrong cumulative load at a
> voussoir joint. Enforcing equilibrium and no tension at the actual joints
> closes the gap to numerical precision for all rings tested. For 16 voussoirs,
> the common multipliers are 0.2385319452, 0.4372473566 and 0.7390497499 at
> t/ri = 0.2, 0.3 and 0.5, respectively. In particular, alpha = 0.41 is
> statically admissible at t/ri = 0.3.

This change adds an audit only. The application's graphical checker has not
yet been changed. A production correction should recover joint resultants
from the loads assigned to each voussoir, check compression explicitly, and
keep that mechanical verification distinct from intersections used for drawing.
Applied point loads also require their actual block assignment; blindly using
the joint number as a funicular segment index is not a general fix.
