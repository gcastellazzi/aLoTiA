# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **A block table, beside Notes and Log.** Everything else in this application
  is a picture, and a picture is the right answer to almost every question it is
  asked. It is the wrong answer to four: which block is the heavy one, where its
  centre of gravity actually is, which group a stone ended up in, and how to take
  one stone out. Those are questions about a list, and the MATLAB application
  answered them with a list.

  One row per block — number, sides, **G(x, y)**, weight, group, and a cross to
  delete it — tinted with its group's own colour, well diluted: the same colour
  the drawing uses under *Group colours*, so a group can be carried from one to
  the other, and pale enough that the numbers on top of it still read. Clicking
  a row picks that voussoir out on the drawing, which needed nothing new drawn:
  `drawBlocks` already took a `highlight`.

  Above the rows the groups themselves, each with **its name in an editable
  field** and its count, and a button for a new empty one — because a second
  material inside a single traced ring has no generator to come from. Changing
  the group on a row moves the block and re-weighs it as that group's material
  at once, which is what a group is for. A filter shows one group at a time.

  Deleting a single block and clearing a whole group are now the same operation
  on different indices, through one function: the half-dozen things that have to
  follow — the joints recovered again, the springings relocated, the weights
  redone, the collapse band thrown away because it belonged to an arch that no
  longer exists — are the part that is easy to get half right twice.

- **Block generation is five named tools, not one long panel.** *Draw blocks*,
  *Trace intr/extr*, *3-point arch*, *Parametric arch* and *Trace whole
  profile* are a colour-coded strip, and only the chosen one's controls are on
  screen. The panel used to show all five at once, which read as one procedure
  with many steps rather than five ways of answering the same question.

- **A 3-point circular arch.** Three clicks on the intrados and three on the
  extrados, and the circle through each triple is the face. Where an arch is
  known to be circular this is the whole of its geometry, and it is quicker and
  far more repeatable than tracing by hand a curve one already knows to be an
  arc.

- **Blocks belong to groups, and a group carries its own material and
  thickness.** Every use of a generator puts the voussoirs it makes into a
  group; the unit weight and the out-of-plane thickness are then applied either
  to one named group or to all of them. A ring traced from a photograph, a
  spandrel cut from a second outline and a pier drawn corner by corner become
  one model with three materials and three widths. *Group colours* paints them
  and labels each group on the drawing. The funicular is indifferent to the
  mixture: whatever a block is made of, its weight is one station on the load
  line.

- **A drawn block snaps to the blocks already there, and the joints between
  them are found.** Three things that are really one:

  *The click snaps to a corner.* Within eleven screen pixels of an existing
  corner it lands on it exactly, and a green square says which corner before the
  click is made. The tolerance is in pixels rather than in model units, because
  the tolerance a hand has is one on the screen and must not grow and shrink
  with the zoom. Only committed blocks are offered: snapping to the corner just
  placed would turn a slightly short click into an edge of no length.

  *Failing a corner, it snaps onto an EDGE and splits it.* A new block rarely
  meets an old one corner to corner — a pier lands in the middle of a springing
  face, a second course starts halfway along the back of the first. A point that
  merely lies on the edge is not enough, because `contactJoint` looks for
  vertices of either block on the boundary of the other, so the edge is broken
  in two and the point becomes a vertex of the old block as well as of the new.
  It is added on a straight edge, so the polygon's area, centroid and weight are
  unchanged; only its description gains a point. A green diamond marks this
  case, to distinguish it from the corner that leaves the old block alone.

  *The joints are then recovered.* A block drawn by hand used to arrive with no
  cuts at all, and the model kept whatever joints it had from before — one fewer
  than it should have, silently, so admissibility was read against the wrong
  list. **A hand-built arch could not be analysed at all.** Committing a block
  now runs the same recovery `joints.js` performs on a stored example, over four
  candidate orders — as drawn, the reverse of that, and either way along the
  arch — which between them cover how blocks actually arrive. Five quadrilaterals
  drawn corner to corner are now a chain with six joints, two springings, an
  admissibility verdict and a collapse band, which they were not before. Where
  no order is a chain the blocks genuinely are not one, and the panel says so
  and names the pair that does not touch instead of guessing.

  The same recovery runs when a second traced run is appended to the first,
  where the concatenated joint list was `blocks + runs` long against the
  `blocks + 1` every panel downstream indexes into, and when a session is
  reopened without joints — a file from a version that never looked.

  **Where no order is a chain, the panel now says why in terms that can be
  acted on.** "6 of 30 consecutive pairs do not touch" describes the order that
  was tried, not the assembly; what settles the question is that a chain has
  exactly two free ends. A flying buttress drawn with its pinnacle and a course
  along its extrados has three, and no ordering of it will ever be a chain. The
  panel names the blocks — *the assembly branches: a chain has two free ends and
  this one has 3, at blocks 1, 19, 30* — and says what to do with the arms: they
  load the arch rather than belonging to it, so the group is cleared and its
  weight put back as an applied load. Blocks touching nothing at all are named
  the same way.

- **Blocks are cleared a group at a time, from a control that is always in
  view.** *Clear blocks in* takes either one named group or all of them, and it
  sits with the group menus rather than inside a method's pane: what was added
  by tracing is often removed while the parametric tool is on screen. It makes a
  group the unit of editing — trace a ring, add a fill, decide the fill was
  wrong, drop it and add another — which is what having groups at all is for.
  The joints of what remains are recovered from the polygons rather than sliced
  out of the old array, since that array is a concatenation with no index to cut
  at once two methods have been mixed; where the remainder is not a chain the
  panels say so, as they already do for a stored example. The tracer's own
  *Clear* becomes **Clear curves** and now does only that.

- **Project notes and a project log**, as two tabs beside the plots and two
  fields in the saved file. The notes are the student's, for what the file
  cannot infer — where the photograph came from, what was assumed. The log is
  the application's, append-only, one timestamped line for every action taken,
  so the sequence that produced a result can be read off the file instead of
  being remembered.

- **The traced image travels inside the session file**, so a saved analysis is
  one self-contained document that opens on another machine. A file that names
  an image it does not carry says which one and offers to load it, rather than
  opening with an empty background and no explanation.

- **Saving goes through the browser's file picker** where there is one, so the
  folder and the name are chosen in one dialog. Browsers without the File
  System Access API keep the old prompt-and-download path.

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

- **The examples the application ships are sessions now, not converted MATLAB
  files.** What the menu offers is the very file the Save button writes —
  geometry, joints, scale, units, loads, notes, and the background image
  embedded — so that nothing is demonstrated that a student could not themselves
  produce and hand in. `loadExample` reads either format and the file says which
  it is, so neither has to be guessed at.

  The eight are chosen to show what the application does rather than to fill a
  menu: the four ways of building geometry, two unit systems, an applied load,
  arches scaled from a photograph and one left in pixels, natural arches beside
  built ones, and **two assemblies that are not a chain at all** — a flying
  buttress cut from a profile, and a flyer with its pier and pinnacle — so that
  what the audit refuses is as visible as what it accepts.

  Each entry carries a sentence saying what it is for, on the menu item itself,
  because a list of eight arches with nothing between them is a list nobody can
  choose from.

- **The catalogue is generated rather than written**, by `node tools/catalogue.js`.
  Every field but that sentence is read off the examples themselves, so it cannot
  go stale the first time one is re-saved, and `tests/examples.test.js` fails if
  the catalogue and the directory disagree — a menu entry that loads nothing is
  not something to find out from a student.

- **The twelve converted MATLAB examples became a test fixture**,
  `tests/fixtures/matlab/`, rather than being deleted. They are not what a
  student should be shown, but they are the only thing that proves the port
  reproduces the solutions MATLAB computed — block for block and ray for ray —
  which is the cross-check the paper's verification section rests on and one
  that cannot be made against files this application wrote itself.
  `tests/core.test.js`, `convert.test.js` and `joints.test.js` read them from
  there, as do `tools/reproduce/makeexample.js`, which still recomputes the
  paper's figure of Poleni's dome to a relative error of 8.0 × 10⁻¹⁶, and
  `tools/setscale.js`.

  **Poleni's dome is therefore not in the menu at present.** A session version
  of it is being made and will take its place; until it does, the one example
  the *Dome slice — Poleni* section of the guide is about cannot be opened from
  the menu.

- **An image loaded from disk is mirrored on the way in.** The drawing has *y*
  running upward, so pixel row 0 — the top of a photograph — lands at the
  bottom of the frame and the picture was drawn upside down: a student's own
  photograph came in with the arch hanging downwards and the lettering
  reversed, and had to be put right by hand with *Flip image*. The examples
  that ship with the app are stored already mirrored, which is why the defect
  was invisible until someone loaded a file of their own. The mirrored copy is
  what is saved, so reopening a session shows what was traced. *Flip image*
  remains, for a file that needs it the other way.

- **Switching to the LoT panel no longer throws away the plot on the right.**
  It forced the force polygon back on screen whatever was there, so reaching
  for the thrust slider cost a student the t/ri study or the N–M diagram they
  were reading. It now does that only from the Notes and Log tabs, which carry
  no drawing at all.

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

- **A session with no joints could be saved and then never reopened.** The
  reader demanded `blocks + 1` joints of every file, and the writer put `[]`
  where the model had none, so any arch that is not a chain — a Poleni dome, a
  section with detached members, an assembly drawn by hand — came back as *"the
  file is inconsistent: 0 joints against 31 blocks"* and would not open at all.
  Having no joints is a state the application already handles and explains
  everywhere else; it is now a state the save format can carry. The count is
  still checked when there are any, because every panel downstream indexes into
  the list. `null` is written rather than `[]`, and an older file's `[]` is read
  back as `null`: an empty array is TRUTHY, so such a model came back claiming
  to have joints and every `if (!m.joints)` guard let it through.

- **A line held between two imposed ends crashed on an arch with no joints.**
  Two `jointCrossings` calls in that branch were unguarded, which the empty
  array above had been hiding.

- **The horizontal thrust was misreported in two of the three modes.** With
  *Drive from the thrust* on, or with both ends imposed, `recompute` returned
  before it wrote the reading, so all three copies went on showing the last
  free-mode value and the words "×1.00 of the reference pole". Pressing **H
  min** moved the slider, moved the line and turned the verdict from
  hyperstatic to isostatic while the number beside it did not change. Each mode
  now states its own thrust and how it was arrived at: a multiple of the
  reference pole, a fraction of H max, or carried from A to B.

- **H min and H max moved only one of the three sliders.** The panel's slider
  went to the end of its travel while the copies under the plot and in the LoT
  pane stayed at mid-travel, so the control the student was looking at
  disagreed with the arch.

- **One slider tick redrew everything three times.** The two mirrored thrust
  sliders had been given a recompute listener of their own on top of the
  mirroring, which already forwards to the panel's slider — six full canvas
  clears where there should be two, on the one control that is dragged
  continuously.

- **The header and the scale line went stale.** Tracing an arch, cutting a
  profile, drawing a block or reopening a saved file left "no arch yet" or
  "0 blocks" above a drawn arch, and "not scaled — lengths are pixels" under a
  ring built in metres. An image scaled before any block is traced now reports
  the size of the image rather than denying that anything is scaled.

- **The 3-point arch had no subdivision control.** It read the parametric
  ring's block count, falling back to the tracer's, and the method tabs hide
  both of those panes — so the number of voussoirs was stuck at whatever those
  invisible fields held, which is the default 16, with nothing on screen to
  change it. The pane now carries its own *Blocks* field, as the other three
  generators do.

- **Every hand-drawn block became a group of its own.** A pier drawn stone by
  stone made twenty groups, twenty rows in both "apply to" menus and twenty
  colours. A run of drawn blocks is one group; a new one starts when the last
  group was made some other way.

- **The panel's buttons were all different heights.** `#panel button + button`
  set a 6px top margin that the flex and grid strips folded into their line
  height, so the first button of a strip stretched and each of its neighbours
  came out exactly 6px shorter; and an id selector was overriding the tab
  strips' own font, so a label wrapped in one button and not in its neighbour.
  The block-generation buttons are now one grid of equal cells, and the selects
  match the number fields beside them.

- **The line of thrust could leave the masonry.** Driven from the thrust, the
  slider ran fifteen per cent past both collapse thrusts, and out there the
  free funicular is not a solution of anything: on the reference ring at 1.25
  times the maximum thrust it left the ring by four fifths of a joint on one
  face and four fifths on the other, with twelve joints of seventeen crossed
  outside the thickness. Drawing that beside a verdict invited the reading that
  such a state is merely inadmissible, when in truth it does not exist.

  The line is now held at the limit state — a real admissible line, tangent to
  the faces at the hinges it forms — and the panel says that is what it is. The
  slider's travel maps onto the admissible band exactly, so every position is a
  distinct equilibrium and the two ends are the two collapse states, where the
  classical patterns appear on their own: five hinges and two degrees of
  freedom at minimum thrust, four and one at maximum. The **H min** and **H
  max** buttons read through the same mapping, so they land at the ends rather
  than beside them.

- **Start a new arch.** The application opened straight into a stored example,
  so a student tracing their own had to clear someone else's arch first. It now
  opens on an empty desk, with the example menu holding a blank first entry;
  *Start a new arch* comes back to it, clearing the trace, the outlines, the
  loads and the imposed ends, but not the unit system or the typed densities,
  which are settings rather than work.

- **Saving always asks for a name.** A page cannot write back to a file it
  opened, so every save is a new file whatever it is called; asking makes that
  plain, and lets a series be kept — *ring 0.15*, *ring 0.20* — instead of a
  directory of timestamps. The timestamped name is still offered as the
  suggestion.

- **The imposed ends are saved with the session.** A file saved with A and B
  set came back with them gone, so the arch reopened held at nothing and the
  line the student had constructed could not be recovered. Files written before
  this still open.

- **Where A and B are put now decides which voussoirs carry the line.** They
  are the user's to place anywhere, and a block whose centroid falls outside
  them is not between the two points the line runs between: its weight belongs
  to the abutment. Move an end inward past the nearest centroid and that block
  drops out; **raise it above that centroid and the block drops out too** —
  near a springing the ring is steep, so a point moved up the face passes
  centroids without moving in *x* at all. The height is tested against the
  nearer end only: against both, lifting B dropped the block at A as well,
  because on a symmetric ring the two centroids sit at the same height.

- **A and B are the support hinges, wherever they are.** The mechanism used to
  read its supports off the end joints, so imposing the ends anywhere else left
  the chain unclosed and the kinematics with nothing to turn about.

- **The line stays inside the masonry with the ends imposed too.** Fixing A and
  B spends two of the three degrees of freedom, leaving the thrust — which has
  a band of its own, narrower than the free family's. Whenever the mechanism is
  **active** the demanded thrust is held inside it: showing the mechanism is
  activating it, since the hinges are being read off the line. Gated on *Drive
  from the thrust* alone, a session with the ends imposed and the mechanism
  merely switched on kept a line fixed at A and B that left the ring at the
  interior hinge. Switching the mechanism on now recomputes rather than only
  redrawing, or the escaping line stayed on screen until something else
  happened to trigger a recomputation.

- **The mechanism is shown in the three-dimensional view.** While the amplitude
  is up, the solids are built from the displaced voussoirs rather than the rest
  position, so the collapse can be watched in three dimensions and, on a dome,
  seen to open along the lunes.

- **Imposing both ends broke the mechanism panel.** Ticking *Impose both ends*
  with nothing picked did nothing at all — the branch needs both points and
  fell through silently — and picking them a little off the springings left the
  line starting inside the arch, never reaching the end joints. The mechanism
  analysis then had no support to hinge about and answered *"no support hinges
  located"*, a true statement that explains nothing, with no macro-blocks
  drawn.

  Three changes. The box now defaults to the springings, which is what the
  option is for. A pick within half a joint's length of an end joint snaps onto
  it, since the springings are short and often nearly horizontal and a click a
  little high lands beside one. And when the ends really are imposed inside the
  arch, the panel says *the line of thrust does not reach either springing*
  instead of stating the symptom. Out of reach counts a joint met only on its
  infinite line, far outside the masonry, which would otherwise have been taken
  for a support hinge at *s* = −2.3.

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
