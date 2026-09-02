# The data the application ships

## The examples are sessions

What the menu offers a student are the very files the **Save** button writes:
one JSON document carrying the geometry, the joints, the weights, the scale and
unit system, the applied loads, the equilibrium state, the notes, the log — and
the background image, embedded. Nothing is demonstrated that a student could not
themselves produce and hand in, which is the reason for choosing them that way.

The format is the one `js/core/persist.js` reads and writes, and it is described
there rather than here, because a second description is a description that goes
out of date. One property is worth repeating: **everything derivable is
deliberately absent** — the force polygon, the thrust line and the joint
crossings are recomputed on opening, so a file stays readable when the mechanics
is corrected.

| | |
|---|---|
| `examples/index.json` | the catalogue the app loads first |
| `examples/<name>.json` | one session, image and all |

## The catalogue is generated, not written

```bash
node tools/catalogue.js
```

Every field but one is read off the examples themselves — how many blocks, which
unit system, whether the coordinates are physical, how the geometry was built,
whether it carries a load or a joint chain. The exception is `about`, the
sentence saying what an example is *for*, which cannot be derived and lives in a
table inside the script. `tests/examples.test.js` fails if the catalogue and the
directory disagree, so adding, renaming or re-saving an example without
rebuilding it is caught rather than discovered from a menu entry that loads
nothing.

## What the set is chosen to show

Between them the examples cover the four ways of building geometry — the
three-point arch, blocks drawn corner by corner, a traced intrados and extrados,
and a whole profile cut radially — two unit systems, an applied load, arches
scaled from a photograph and one left in pixels, and **two assemblies that are
not a chain at all**, which are there so that what the audit refuses is as
visible as what it accepts.

## The earlier MATLAB corpus

The twelve converted `.mat` examples the application was first built to read are
**not shipped**. They are a test fixture, `tests/fixtures/matlab/`, because that
is what they are for: each carries the solution MATLAB computed, and the port
has to reproduce it from the same inputs, block for block and ray for ray.
`tests/core.test.js`, `tests/convert.test.js` and `tests/joints.test.js` run
against them, and `tools/reproduce/makeexample.js` builds the paper's figure of
Poleni's dome from them.

Their conventions — `Blocks_coordinates_4_points` and the rest of the MATLAB
field names preserved verbatim, `null` for an empty array, and above all the
`_frame` block that says whether the coordinates are pixels or physical units —
are documented in `tests/fixtures/matlab/README.md`.
