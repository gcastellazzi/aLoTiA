# The MATLAB corpus, as a test fixture

These twelve files are the earlier generation of examples: the converted `.mat`
sessions the application was first built to read. **They are not shipped.** What
the application offers a student are the sessions under
`docs/app/data/examples/`, written by its own Save button.

They are kept, and kept here, because of what they are for. Each carries the
solution MATLAB computed — the force polygon, the pole, the line of thrust — and
the port has to reproduce it from the same inputs, block for block and ray for
ray. That is the cross-check the paper's verification section rests on, and it
cannot be made against files this application wrote itself.

## What reads them

| | |
|---|---|
| `tests/core.test.js` | reproduces every stored centroid, area, ray and thrust line |
| `tests/convert.test.js` | unit conversion, and the `_scale` block |
| `tests/joints.test.js` | recovering the cuts between voussoirs from the voussoirs |
| `tests/contacts.test.js` | the contact graph, on geometry nobody drew for it |
| `tools/reproduce/makeexample.js` | the paper's figure of Poleni's dome |
| `tools/setscale.js` | writes a `_scale` block into one of them |

They were generated from the MATLAB examples by `tools/mat2json.py`, which lives
in the development repository, and **are not edited by hand**.

## The twelve

| | |
|---|---|
| a complete stored solution, recomputed | 8 |
| saved before a solution was computed | 3 — Utah Arch, Nervi, Pippard–Ashby |
| internally inconsistent, detected and reported | 1 — San Francesco |
| joints recovered from the voussoirs | 9 |

`Poleni_Example_01` is the one the paper computes Figure 2 from; a session
version of it will take its place among the shipped examples.

## Conventions

- **MATLAB names are preserved verbatim.** `xy_Point_A`, `Blocks_coordinates_4_points`,
  `Force_Funicolar_Polygon` and the rest keep the spelling they have in the
  `.mlapp`, misspellings included. The point is that a field can be checked
  against the original by eye.
- **An empty MATLAB array becomes `null`, not `[]`.** In the application "not
  set" and "set to nothing" are different states.
- `1×N` and `N×1` arrays collapse to a flat list; genuine matrices stay nested.
  Singleton axes are squeezed, so the ray directions arrive as `N×2` rather
  than MATLAB's `N×1×2`.
- The block outlines, a MATLAB cell array of `{x, y}` rows, become a list of
  `{"x": [...], "y": [...]}`.

## The one thing you must not get wrong: the coordinate frame

**The block coordinates are not always in image pixels.** In eleven of the
twenty-eight examples the user picked a reference length and scaled the model,
so the coordinates are in *physical* units while the image is still stored at
its own pixel size. Nothing in the MATLAB file states which frame is in use,
and guessing from the numbers is unreliable — an arch need not span its
photograph.

Every JSON therefore carries an explicit block:

```json
"_frame": {
  "coordinates": "physical",
  "units_per_pixel": 0.0286,
  "inferred": true
}
```

- `coordinates` — `"pixels"` or `"physical"`. **Read this; never assume.**
- `units_per_pixel` — how many physical units one pixel of the stored image
  represents. `1.0` when the coordinates are pixels.
- `inferred` — `true` when the frame was deduced rather than read from
  `current_image_scaling_factor`. The application should be prepared to let the
  user correct it.

Current tally: **16 in pixels, 12 physical**, of which 17 deduced.

The deduction rule, in `_frame()`: `current_image_scaling_factor`, when
present, is the number of physical units per pixel and settles the question.
When it is absent, the coordinates are pixels unless the traced geometry spans
less than a tenth of the image, which no pixel-frame tracing does.

That threshold is not cosmetic. `Poleni_Example_04` carries the same geometry
as `Poleni_Example_05`, which *does* record the factor; a looser bound put the
two in different frames and would have drawn one of them at forty times the
size of the other.

## The fields that matter

| Field | Meaning |
|---|---|
| `Blocks_coordinates_4_points` | the voussoirs, one `{x, y}` outline each |
| `xyg_Blocks` | block centroids |
| `A_Blocks`, `W_Blocks` | areas and weights |
| `Thickness_Blocks` | out-of-plane thickness, per block |
| `xy_Point_A`, `xy_Point_B` | the two springings |
| `xy_Center` | centre used for the circular-arch generator |
| `xy_Pole_Prime`, `xy_Pole_Def` | trial and final pole of the force polygon |
| `Force_Funicolar_Polygon` | the force polygon, one row per block |
| `Preliminar_Funicolar_Problem`, `Final_Funicolar_Problem` | ray directions `u1`, `u2` |
| `LOT_xy`, `LOT_Force` | the line of thrust and the force along it |
| `HorizontalThrust` | the value the slider drives |
| `UNISYS` | unit system: `SI`, `Nmm`, `kgcm` |
| `Conversion_Unit_*`, `Unit_Length_scaling` | unit conversion factors |
| `ImageFileName`, `ImageSize` | the background image, and its **original** pixel size |

`ImageSize` is the size of the image *as it was in MATLAB*, not the size of the
stored file. The stored file may have been downscaled; the coordinates are
always expressed against the original, so the application scales the image, not
the data.

## Schema versions

The examples come from two generations of the MATLAB app. The older ones carry
32 fields, the newer ones up to 51 — the additions are the unit-conversion
block, the reactions at the springings, and the Poleni switch. Absent fields
are simply missing from the JSON; the application must treat a missing field
and a `null` field the same way.
