# The data model of aLOTofImaginArches

Everything the web application loads is here. The files are generated from the
MATLAB examples by `tools/mat2json.py` and **are not edited by hand**:

```bash
../pyLOT/.venv_aLOT/bin/python tools/mat2json.py          # regenerate
../pyLOT/.venv_aLOT/bin/python tools/mat2json.py --check  # compare with the .mat
```

`--check` re-reads every JSON and compares each numeric field against the
original `.mat`, value by value. It must print *All 28 examples match their
JSON* before anything downstream is trusted.

## What is here

| | |
|---|---|
| `examples/index.json` | the catalogue the app loads first |
| `examples/<name>.json` | one saved state, MATLAB field names preserved |
| `examples/<name>.jpg` or `.png` | the background image |

28 examples, 4.5 MB in total. Photographs are stored as JPEG and capped at
1600 px on the long side; images with few colours stay PNG, because a line
drawing survives PNG losslessly at a fraction of the size and JPEG would ring
around the lines.

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
