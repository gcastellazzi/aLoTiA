# Reproducing the figures and tables of the paper

Every computed number in the SoftwareX article is produced by the two scripts in
this directory, which import the application's own `core/` modules. Nothing is
transcribed by hand, so a figure cannot drift away from the software it
describes.

```bash
node tools/reproduce/makedata.js
node tools/reproduce/makeexample.js Poleni_Example_01
```

Node ≥ 18, no dependencies. The scripts write `.dat` files into
`tools/reproduce/data/`, which is not committed: the point is that you generate
them, not that you trust ours.

## What each script produces, and what it should say

| Paper | Script output | Expected |
|---|---|---|
| Fig. 1, Poleni's dome recomputed | `Poleni_Example_01_*.dat`, `_meta.tex` | 56 blocks; agreement with the solution MATLAB stored, relative error **8.0 × 10⁻¹⁶** |
| Fig. 2, admissible thrust band | `band_free.dat`, `band_pinned.dat` | computed by `collapseRange`, the application's own function: the browser agrees to 5 × 10⁻⁵ |
| Fig. 3, the collapse mechanism | `mech_rest.dat`, `mech_moved.dat`, `mech_hinges.dat` | **5 hinges, dof 2** at minimum thrust; every joint opening positive |
| Tab. 4, least admissible *t*/*r*ᵢ | `minthick.dat`, `minthick_table.tex` | at *n* = 16: **0.1984** pinned, **0.1155** free (Heyman's continuous ring: 0.108) |

The reference ring throughout is semicircular, *r*ᵢ = 1, 16 voussoirs.

## Checking Figure 2 in the browser, without Node

Figure 2 is a sweep — 26 thickness ratios, and for each of them a search over
the thrust and the two end parameters — so the figure as a whole belongs to the
script. **A single point of it does not.** Open the application, and in the
*Geometry* panel:

1. **Circular ring** — inner radius `1`, thickness ratio `t/ri`, blocks `16`,
   then **Generate ring**. This is the same ring the script builds, from the
   same function.
2. *Mechanism* tab → **Drive from the thrust**.
3. The panel reports `stands between H = … and …`. That interval is
   [*H*min, *H*max] at that *t*/*r*ᵢ — one vertical slice of the blue band.

Measured this way against `band_free.dat`:

| *t*/*r*ᵢ | `band_free.dat` | in the browser |
|---|---|---|
| 0.16 | 0.1800 – 0.2250 | 0.1794 – 0.2269 |
| 0.20 | 0.1700 – 0.2450 | 0.1652 – 0.2464 |
| 0.24 | 0.1550 – 0.2600 | 0.1536 – 0.2626 |

The script scans the thrust on a grid of step 0.005 and so reports the band
quantised to it; the application bisects and is finer. The two agree to within
that step, and the browser figures bracket the plotted ones.

**The red band cannot be reproduced in the browser, and this is not an
oversight.** It is the *superseded* construction, with both ends of the thrust
line pinned at the joint mid-points. The application frees them — that is the
result Fig. 2 exists to show — so the pinned family survives only in
`makedata.js`, which builds it explicitly with `funicular` and
`pointOnJoint(…, 0.5)`.

## The reduced example set

**Where they live.** What the application *ships* to a student are the sessions
under `docs/app/data/examples/` — the very files its Save button writes. The
twelve converted MATLAB examples the paper's audit discusses are a **test
fixture**, `tests/fixtures/matlab/`, because that is what they are for: they
carry the solution MATLAB computed, and the port has to reproduce it from the
same inputs. `makeexample.js` above reads them from there, which is why Fig. 2
still recomputes Poleni's dome to a relative error of 8.0 x 10^-16.

The full corpus of twenty-eight converted files, the MATLAB application they
came from, and the `.mat` converter live in the development repository,
<https://github.com/gcastellazzi/aLOTofImaginArches>.

The twelve were chosen to cover every case the paper names:

| | |
|---|---|
| a complete stored solution, recomputed | 8 |
| saved before a solution was computed | 3 — Utah Arch, Nervi, Pippard–Ashby |
| internally inconsistent, detected and reported | 1 — San Francesco |
| joints recovered from the voussoirs | 9 |
| joints refused, with the reason stated | 3 — San Francesco, Poleni 01, Utah Arch |
