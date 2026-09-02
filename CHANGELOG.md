# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **The admissible thrust band, drawn by the tool that claims to draw it.** The
  t/ri panel said the published figures were computed on its ring and could be
  checked there, and they could not: what it drew was the *convex hull of a
  sampled scatter* — a coarse grid of end points and thrusts, hulled once over
  the states that stood and once over the states that did not. The second of
  those is not a region of anything: a state that does not stand says nothing
  about its neighbours, and the pink polygon it produced claimed a shape the
  mechanics never asserted. The hull of the admissible states was a crude
  under-estimate of the real band, and both were drawn only at the thicknesses
  the student happened to have visited.

  **Admissible band** now scans a range of thicknesses and, at each, computes
  the least and the greatest thrust that admit *some* line — `collapseRange` at
  its full accuracy for the free family, and a new `pinnedRange` for the
  classical construction with both ends at the joint mid-points, bisected by the
  same scheme rather than sampled. The two bands are drawn as filled regions,
  the states the student has visited as markers on top of them. Checked against
  the paper's own data: **both bands agree to 5 × 10⁻⁵**, which is the rounding
  of the published file.

  A thickness at a time, because a full `collapseRange` is some two hundred
  milliseconds and twenty-seven of them is six seconds — done in one go the tab
  would freeze with nothing on screen to say why; done this way the curve draws
  itself from left to right and the page stays alive. A ring generated in the
  middle of a run abandons it.

  One trap is now written down where it can be read: the scatter's `midBase`
  samples are **not** the pinned family. `pointOnJoint` puts the end at the
  middle of the whole joint; the scatter runs its parameter over the outer half
  of it, from the springing voussoir's centroid to the extrados, so its middle
  sits further out. The two look like the same experiment and are not.

- **The parallels, dashed, around the lune.** A lune is drawn as a slice and a
  slice does not say what it is a slice *of*. Two circles about the axis of
  revolution at the springing and two more at the crown, and the eye closes the
  dome around the wedge on the screen. They are the parallels the dome panel
  already reports in words, and Poleni's whole argument is that the weight of a
  voussoir follows this radius, so it is worth seeing rather than reading.

  **Each level gets the radii of what actually stands at it** — the intrados and
  the extrados of the course that is there. On St Peter's that is the springing
  of the lower dome at some 21 and 23 units from the axis, and the lantern at 3
  and 5. Carrying one pair of radii to both levels would draw a cylinder *around*
  the dome instead of the dome's own parallels, and would say nothing about how
  a lune narrows, which is the whole of the argument. The radii come from a
  horizontal section rather than from the vertices at that height: at the very
  bottom the polygon only touches the level, and on a skew springing only one
  corner sits at the extreme, so both would give one radius where two are
  wanted. The section is taken a hundredth of the height inside and drawn at the
  face, which is invisible.

  **Drawn under the masonry, not over it.** Drawn last, the far half of each
  circle crossed the stones in front of it and the solid stopped reading as
  solid — the whole isometric effect went with it. Drawn first, the masonry
  covers what it stands in front of and the circles pass behind, which is what
  tells the eye they are circles at all.

  They are built apart from the drawing and handed both to the view's bounds and
  to the pen, because the rings reach right round the axis while the lune is a
  slice: fitted to the slice alone, they would be framed out of their own
  picture. A barrel vault has no axis of revolution and is drawn exactly as
  before, to the pixel.

- **An empty diagram says why it is empty, in its own space.** A pair of axes
  with nothing between them reads as a fault in the software. The N-M diagram
  now writes the reason across itself, and there are four quite different ones,
  asking four different things of the student: build an arch, pick a joint, move
  the line so it reaches the joints, or accept that *this structure is more than
  one branch* — in which case the reason the joint recovery already worked out
  is what is shown, because it names the blocks and says what to do. The
  thickness study says that it is drawn on a ring built from its numbers, and
  where to build one. Both keep a short form in the status line under the plot,
  since the long one belongs where the eye is.

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

- **Hooke's cable carries the force it is under.** The arch's line of thrust has
  always been drawn as a band whose width is the force in each segment; the
  cable beside it was a wire of one thickness, which quietly contradicted the
  sentence the whole drawing exists for — *ut pendet continuum flexile, sic
  stabit contiguum rigidum inversum*. The cable is the line reflected, so
  segment *i* of one is segment *i* of the other and carries the same force, and
  it is now given the same list and drawn in the same grammar, at the same
  width factor, so the two can be laid side by side. Only the colour differs,
  because one is a compression and the other a tension.

  The band thickens towards the springings and thins at the lowest point, where
  the tension is the horizontal thrust and nothing else — measured on a
  fourteen-voussoir lune as 11 pixels at the haunch against 3 at the bottom.

- **The circles on the cable say what they are**: **blue for a voussoir**,
  **orange for a load applied by hand**. The tag was already there —
  `blocksLike` marks every station 0 or 1, because a load and a weight are both
  one station on the load line and the construction is deliberately indifferent
  to which. That indifference is worth showing; a drawing in which a stone and a
  cart cannot be told apart is not.

- **A slider for the thickness of the line of thrust**, beside the three that
  fix it. The band's width has always been the force in each segment; this says
  how wide the largest is drawn. At nothing it is a bare line, which is what to
  use when the band covers the joints it has to be read against — measured from
  0 pixels at one end of the travel to 16 at the crown and 34 at the haunch at
  the other, with the middle reproducing what was drawn before.

- **A few formatting tools in the notes**: bold, emphasis, underline, links, and
  a menu for the line — Title, Heading, Body, Bullet.

  **The notes open on the reading of them, not on the markers.** That is what
  notes are for most of the time: written once, and read on every reopening, by
  whoever the file was handed to. *Edit* turns the writing on and brings the
  tools with it — they are hidden the rest of the time, so the strip is quiet —
  and *Done* turns it off again. Double-clicking the text starts writing too,
  which is how one starts writing in everything else, and an empty note says so
  rather than sitting blank.

  **The stored value is still a plain string.** The markers go in the text
  (`**bold**`, `*emph*`, `_underline_`, `[what it says](where it goes)`,
  `# title`), so a session file stays readable in a text editor, diffable, and
  free of anyone else's markup. `persist.js` is untouched. The one place this
  notation and markdown disagree is the underscore, which markdown spends on
  italic and this keeps for the older plain-text meaning, because there were
  three buttons to find markers for.

  **Nothing renders markup.** `core/notes.js` returns a description — blocks,
  each holding spans, each a piece of text with flags — and the interface builds
  elements from it with `textContent`. Untrusted text therefore never becomes
  markup, which is what makes reading somebody else's notes safe rather than
  carefully sanitised: a note containing a tag renders as a note containing a
  tag. The one attribute ever written from a note is a link's address, and only
  `http:`, `https:` and `mailto:` are followed — a refused address is left on
  the page exactly as it was typed rather than silently dropped, so the writer
  can see that it did not become a link. `tests/notes.test.js` pins both, and
  the browser check confirms that a note carrying an `onerror` image and a
  `javascript:` link creates no image, no link, and runs nothing.

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

- **The block view is unchanged, and now says why.** Three ways of improving the
  painter's algorithm it uses were tried against Poleni's dome and none survived
  contact with it, so the drawing is exactly what it was — proved pixel for
  pixel — and `visibleFaces` is now an extracted, tested function carrying the
  record. Culling the faces turned away is half the painting and sound in
  principle, but only if the outward direction is known: the winding is
  inconsistent between the two generators, and deducing it from each solid's own
  centre goes wrong on thin curved pieces, which put **holes in the ribs and
  shells**. Ordering the blocks first and their faces within is correct for
  compact separated solids and wrong here, a rib being one long thin solid
  interleaved with two dozen short ones, so the rib was painted over the shell
  that covers it. Sorting on the farthest vertex came out between the two.

  Two solids that interleave in depth have no correct order and Canvas has no
  depth buffer to settle it with; the honest fixes are finer geometry — long
  solids cut into compact ones — or WebGL, which is a different program. The
  note in the module says so, so that nobody spends the afternoon again.

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

- **A rib came through the shell that covers it.** On St Peter's dome a violet
  hairline ran down the middle of the orange vault, along a meridian, and read
  as a stone behind the vault being drawn in front of it. It was: measured
  against a software depth buffer at 600 x 600, the painter mis-painted 1010
  pixels of 127272, and 637 of them were rib.

  The cause is that one depth per face is a fair summary of a small face and an
  unfair one of a large face held edge-on, and it is the second kind that loses
  the argument. Such a face — its own vertices differing in depth by more than
  a thirtieth of the whole scene — is now cut into a 2 x 2 grid, so each quarter
  carries a depth of its own. Every other face is left alone, each quarter
  remembers which of its edges it inherited so the voussoir keeps exactly the
  outline it had, and a budget stops the cutting on a model too large to afford
  it, spending it on the deepest faces first. Over four viewpoints the
  mis-painted pixels fall 1010 to 74, 670 to 52, 700 to 65 and 154 to 14, for
  1718 faces at 3 ms becoming 5090 at 12 ms — still a comfortable drag, on the
  largest model in the catalogue.

  Culling, ordering by block, and sorting on the farthest vertex had all been
  tried before and are all worse; the note in `render/solid.js` keeps the record
  so the afternoon is not spent twice.

- **The 3-D view now has aerial perspective.** The head-on light says which way
  a face turns but nothing about how far off it is, and on a dome the flat
  meridian ends of the ribs and of the two shells face the light almost
  identically. They came out at almost the same brightness, so a rib end
  standing five units back read as lying on the shell in front of it. Faces are
  now washed toward the ground colour with distance, outlines included — an
  outline left at full strength undoes the cue.

- **Blocks, Heyman, t/ri, Notes and Log stopped responding.** Their click
  listeners sat immediately after a block of code that was cut out, and the cut
  ran to the wrong anchor and took them with it. Four working panels became
  unreachable and **every test still passed**, because a tab with no listener
  does not throw, does not log and does not draw anything wrong — it does
  nothing at all, and looks exactly as it did.

  `tests/wiring.test.js` now reads the markup and `app.js` as text and checks
  that they still describe the same page: that every tab has a click listener,
  that every element the code reaches for by id exists, and that nothing in the
  markup is left with no code behind it. Both checks were confirmed to fail when
  the faults they are for are put back.

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
