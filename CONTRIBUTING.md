# Contributing

Bug reports, corrections to the mechanics, and new teaching examples are all
welcome. The project is small and has no dependencies; nothing here should take
more than a few minutes to set up.

## Running it

```bash
git clone https://github.com/gcastellazzi/aLoTiA.git
cd aLoTiA
npm start
```

Then open <http://localhost:8000/app/>. There is nothing to install and nothing
to build: `docs/app/` is plain ES modules, served as they are, so the source you
read is the source that runs. A server is needed only because browsers refuse
ES modules and `fetch()` over `file://`.

## Running the tests

```bash
npm test
```

160 tests, Node ≥ 18, the built-in runner, no framework. They are the only
dependency-free way to check the mechanics, and they are expected to pass before
anything is merged. CI runs them on Linux, macOS and Windows against Node 18, 20
and 22.

## What the tests are for

They are not coverage for its own sake. Each one pins down a property that
failed silently at least once:

- **`axis equal` cannot be checked by looking at it.** A ten per cent anisotropy
  is invisible and falsifies every length read off the picture, so it is
  measured.
- **A reversed extrados** gives bow-tie blocks, wrong areas, and no error.
- **A contact run is not always one hinge**, and the arithmetic hides it: the
  count looks right and the answer is wrong.
- **The sign of a null-space vector is arbitrary**, so half the time the
  collapse mechanism ran backwards, with the masonry passing through itself.

If you change the mechanics, add the test that would have caught the mistake you
nearly made.

## Style

Match what is there. The comments in `docs/app/js/core/` explain *why* a thing
is done and what happens when it is not, often with the measured numbers from
when it went wrong; that is the house style and it is deliberate. Two-space
indentation, ES modules, no build step, no dependencies — the last is a hard
constraint, not a preference.

## Reporting a problem

Open an issue at
<https://github.com/gcastellazzi/aLoTiA/issues>. For anything about
an arch that behaves oddly, please **save the session** (the *Save* button
writes the whole state as one JSON file) and attach it: it carries the traced
curves, the blocks and joints, the weights, the loads, the scale, and the three
degrees of freedom, and it is enough to reproduce exactly what you were looking
at.

For questions that are not defects, write to
<giovanni.castellazzi@unibo.it>.

## Licence

By contributing you agree that your contribution is licensed under the MIT
licence, as the rest of the project is.
