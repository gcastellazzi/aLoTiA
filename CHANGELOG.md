# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### The Abaqus export

The support selector can now keep the original A/B hinge lines or add a roller
bed over each complete end face. In the latter case every face node is blocked
only in the local face-normal direction, while the hinge line remains fixed in
translation and tangential motion of the remaining face nodes stays free. The
roller bed now propagates to every exterior face that is coplanar with and
touches the face containing A or B, including faces of adjacent blocks; remote
faces that merely lie on the same infinite plane are left unconstrained.
The roller bed is written as a `*Boundary` on each face node set, in the step
beside the hinge lines, instead of one single-term `*Equation` per node: those
equations were not boundary conditions, were not listed or reliably imported
by Abaqus/CAE, and left only the hinge nodes restrained. A face normal to X or
Z uses the global DOF; an inclined face receives a nodal `*Transform` whose
local axis 1 is the face normal, and concentrated loads on those nodes are
rotated into that system.

Voussoirs are meshed as a structured grid rather than a pair of wedges, at
least three elements across the ring thickness by two along the arch, with a
further division at every traced vertex and at every point where a support or
a load acts. A cell that comes out concave is split rather than dropped, and
every element is checked on all eight of its corner Jacobians, not on its total
volume alone --- a hexahedron can have a good volume and still be inside out at
one corner, which is what Abaqus reports as a zero or negative volume.

Contact is built on the joints. Each voussoir now offers only its two joint
faces, as separate surfaces, and each contact pair is the two faces that
actually abut, with a closing tolerance for a joint traced by hand. The whole
outline used to be offered instead, which produced facets facing away from
their pair, joints that never closed, and one negative eigenvalue per block
left free. Where a joint genuinely cannot be identified, only that joint falls
back, and the deck says which.

Nodes no element uses are dropped and the rest renumbered. A cell thrown out
for being degenerate used to leave its corners behind; Abaqus deletes an
unconnected node, and a support set built on one then has no members, which is
fatal --- "a boundary condition has been specified on node set ... but this
node set is not active in the model".

Each voussoir is divided along the arch in proportion to its own shape, so the
cells come out roughly square. Two by two on a block three times longer than it
is thick gives cells of aspect three, and a skewed cell of aspect three is a
distorted element. The mesh density is set from the panel, beside the export
button.

### Block stereotomy

Blocks generated between a traced intrados and extrados can retain the legacy
matched stations, follow the local normal calculated either on the extrados or
on the mean line, use horizontal sub-normal courses (the tholos/igloo case), or
use vertical super-normal cuts (the lintel case). Invalid repeated or missing
intersections are reported before blocks are generated. Sub-normal courses now
have one common vertical height and cover the crown above the intrados. Working
upwards, courses wider than the mean block width established below are divided
with alternating half-module offsets, as running bond.
Because those courses form a bonded assembly rather than one serial voussoir
chain, their Abaqus export uses all-exterior general contact instead of pairing
unrelated consecutive blocks. That general contact is written as model data,
before the step: Abaqus/Standard does not accept `*Contact` inside a step, so
the courses previously had no interaction at all. A course cell that contains
two separate pieces of the ring (both sides of the crown just below it, or both
legs of a wide course) is now split into two blocks; the concave clip used to
join them with a zero-width bridge, one rigid part with phantom faces over the
opening.

Coursed blocks smaller than a fifth of a full block (module times course
height) are merged into the neighbour in the same course with which they share
the longest vertical joint, by clipping the outline once more with both cells;
a sliver with no such neighbour is dropped and reported in the log. These
crumbs, left where a cut falls just beside a traced curve, became single
wedges a millionth of the ring in section which Abaqus rejects as elements of
zero, small or negative volume. In the export, outlines meshed as wedges are
first cleaned of vertices within a thousandth of the block of a neighbour or of
the chord through their neighbours (support and load points are kept), and are
triangulated to maximise the shape of the worst triangle instead of clipping
the first valid ear, which left needle triangles even in well-sized blocks.

Normal joint cuts are oriented from the intrados towards the extrados, so on a
ring they point left on the left haunch and right on the right one. Each cut
now looks for the intrados behind the reference curve and the extrados ahead of
it, further along each curve than the previous cut; taking the nearest crossing
of the infinite normal line either way used to pick a point back behind the
previous joint or on the far haunch, and blocks came out crossed or inside out
without any warning. The normal is a three-point derivative over half a block
either side of the station, so hand-traced polygons and kinks no longer make it
jump, and the mean line is built from densely resampled curves rather than from
the block stations. Cuts that cross, leave the ring, or cannot reach a curve are
reported with the number of the failing cut. The trace check and the Generate
button now judge the blocks of the selected stereotomy instead of the legacy
stations, and a generation that fails reports why instead of doing nothing.
With a normal stereotomy selected, the reference (the extrados highlighted, or
the dashed mean line), the oriented normal at every station and the resulting
cuts are drawn over the trace, and a failing station is marked in red.

The traced intrados and extrados now remain active after block generation and
are removed only by Clear curves. Re-generating replaces the group derived from
those curves instead of appending a duplicate. Sub-normal courses also accept
an approximate horizontal block width; once a tessellation exists, editing the
value rebuilds it live while retaining all unrelated block groups.

The main horizontal-thrust slider has a 5x/10x range button. Its centre remains
the saved equilibrium state while the upper logarithmic limit doubles from
five to ten times the reference thrust.

### The activation multiplier

The Mechanism tab computes the activation multiplier α0 of the linear
kinematic analysis: horizontal forces α·W at the voussoir centroids, in +x or
−x, added to the weights, with the forces applied by hand kept but neither
amplified nor given mass. By the principle of virtual work every mechanism of
four hinges placed at the intrados or extrados ends of the joints is examined
in closed form — bodies 1 and 3 turn about the ground hinges, the centre of the
middle body is where the lines through its hinges meet — with prefix sums of
the loads, so a ring of forty voussoirs is searched in a fraction of a second
and a larger one by a coarse pass refined joint by joint. A mechanism counts
only in the sense that opens every joint, the springings included; it is then
activated by the one direction whose horizontal forces do positive work. The
least multiplier in each direction and its mechanism are reported, and the
mechanism goes onto the drawing, the displacement slider and the 3-D view in
place of the one read off the line of thrust. Four hinges can also be picked
by hand, or edited from the minimum, to see the multiplier of that mechanism
or why it is not one. With both ends imposed the search stays between them.

The mechanism the tab reads off a line of thrust under the vertical loads is
not used: that line passes through its hinges, so the vertical loads do no
virtual work on it and its multiplier is zero by construction. The search is
tested against virtual work on every mechanism of a ring, and against the
static theorem: with horizontal loads below the minimum a line of thrust still
fits inside the ring, above it none does.

## [1.1.0] — 2026-09-02

Interactive graphical statics of masonry arches in the browser, as plain ES
modules with no build step and no dependencies.

### Building an arch

Five named tools: draw blocks by hand, trace an intrados and an extrados over a
photograph, trace a whole profile for sections two faces cannot describe, fix a
circular arch by three points on each face, or build an exact ring from its
numbers. A drawn block snaps to the blocks already there and the joints between
them are found. Blocks belong to groups, each carrying its own material and
thickness, listed in a block table with centroid and weight. Scale, units and
applied point loads.

### The mechanics

The line of thrust and its three degrees of freedom, admissibility joint by
joint, hinge formation and the collapse mechanism with its kinematics, the
N–M diagram and the geometrical safety factor, both ends imposed by the
classical trial-pole construction, Bow's notation, Hooke's cable, and Poleni's
dome by Pappus' theorem. The admissible thrust band against thickness, with the
ends free and with the ends pinned, reproduces the published figure to 5 × 10⁻⁵.

### Reading it

A three-dimensional block view of the assembly, with the parallels of a dome
drawn around its lune. Project notes and a project log. A diagram that cannot
be drawn says why in its own space.

### Keeping it

A session — blocks, groups, weights, loads, scale, notes, log, the traced
photograph and the state of the three sliders — saved to and reopened from a
single JSON file.
