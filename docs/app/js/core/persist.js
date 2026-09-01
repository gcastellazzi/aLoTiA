/**
 * Saving and reopening a piece of work.
 *
 * A student traces an arch over a photograph, subdivides it, sets a scale,
 * hangs a load on it and hunts for an admissible thrust line. That is an
 * hour's work, and until now it lived only in the tab. This module turns it
 * into one JSON file and back.
 *
 * WHAT IS AND IS NOT SAVED. Everything the student decided is saved: the two
 * traced curves, the blocks and joints derived from them, the weights, the
 * applied forces, the scale and unit system, and the three numbers that fix
 * the equilibrium state. Everything derivable is NOT: the force polygon, the
 * thrust line and the joint crossings are all recomputed on opening, so a file
 * saved by one version stays readable when the mechanics is corrected.
 *
 * A user-loaded background image is saved as a data URL, so the session can be
 * reopened as a single file. Older saved sessions and catalogue examples may
 * still carry only the image name.
 *
 * The format is the one documented in data/README.md: polygons as {x, y}
 * arrays, points as [x, y] pairs, joints as {a, b}.
 */

export const FORMAT = 'aLOTofImaginArches/state';
export const VERSION = 1;

/** Round-trip a polygon, whatever shape it arrived in. */
function polygon(p) {
  if (!p) return null;
  if (Array.isArray(p)) {
    return { x: p.map((q) => q[0]), y: p.map((q) => q[1]) };
  }
  return { x: Array.from(p.x), y: Array.from(p.y) };
}

const points = (a) => (a ?? []).map(([x, y]) => [x, y]);
const numbers = (a) => Array.from(a ?? [], Number);

/**
 * The state of a session, as a plain object ready for JSON.stringify.
 *
 * @param {object} state    the app's state
 * @param {object} controls the slider positions, {thrust, startPos, split}
 * @param {string} [imageName]
 */
export function serialise(state, controls = {}, imageName = null) {
  const m = state.model ?? {};
  return {
    format: FORMAT,
    version: VERSION,
    saved: new Date().toISOString(),
    // The app keeps both on the model: `name` is what the arch is called, and
    // `image` the file the student traced over.
    exampleName: state.exampleName ?? m.name ?? null,
    imageName: imageName ?? m.image ?? null,
    notes: String(state.notes ?? ''),
    log: (state.log ?? []).map((row) => String(row)),
    image: state.imageData
      ? {
        name: state.imageData.name ?? imageName ?? m.image ?? null,
        type: state.imageData.type ?? null,
        width: Number(state.imageData.width ?? m.imageSize?.[0] ?? 0),
        height: Number(state.imageData.height ?? m.imageSize?.[1] ?? 0),
        dataUrl: state.imageData.dataUrl,
      }
      : null,
    system: state.system ?? 'SI',
    trace: state.trace
      ? { inner: points(state.trace.inner), outer: points(state.trace.outer) }
      : null,
    model: state.model
      ? {
        name: m.name ?? null,
        image: m.image ?? null,
        imageSize: m.imageSize ? [...m.imageSize] : null,
        imageDrawSize: m.imageDrawSize ? [...m.imageDrawSize] : null,
        groups: m.groups?.length ? m.groups.map((g) => ({ ...g })) : undefined,
        blockGroups: m.blockGroups?.length ? m.blockGroups.map((id) => Number(id)) : undefined,
        blocks: (m.blocks ?? []).map(polygon),
        // null, not [], when there are none. An empty array is TRUTHY, so a
        // model saved with no joints came back claiming to have some and every
        // `if (!m.joints)` guard downstream let it through.
        joints: m.joints?.length
          ? m.joints.map((j) => ({ a: [...j.a], b: [...j.b] }))
          : null,
        centroids: points(m.centroids),
        weights: numbers(m.weights),
        areas: numbers(m.areas),
        thickness: numbers(m.thickness),
        pointA: m.pointA ? [...m.pointA] : null,
        pointB: m.pointB ? [...m.pointB] : null,
        frame: m.frame
          ? { ...m.frame }
          : { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
      }
      : null,
    // THE IMPOSED ENDS ARE PART OF THE SESSION. A file saved with A and B set
    // came back with them gone, so the arch reopened held at nothing and the
    // line the student had constructed could not be recovered.
    ends: state.ends && (state.ends.A || state.ends.B)
      ? {
        A: state.ends.A ? [...state.ends.A] : null,
        B: state.ends.B ? [...state.ends.B] : null,
        imposed: !!controls.imposeEnds,
      }
      : null,
    forces: state.forces
      ? {
        points: points(state.forces.points),
        magnitudes: numbers(state.forces.magnitudes),
      }
      : null,
    basePole: state.basePole ? [...state.basePole] : null,
    // The dome settings belong with the weights they produced. Without them a
    // reopened lune would show its panel switched off while its weights were
    // still those of a lune -- consistent numbers, a lying interface.
    dome: {
      poleni: !!(state.dome && state.dome.poleni),
      angleDeg: Number(state.dome?.angleDeg ?? 15),
      axisX: Number(state.dome?.axisX ?? 0),
    },
    controls: {
      thrust: Number(controls.thrust ?? 50),
      startPos: Number(controls.startPos ?? 50),
      split: Number(controls.split ?? 50),
    },
  };
}

/**
 * Read a saved session back, checking it before trusting it.
 *
 * Throws with a sentence a student can act on rather than returning something
 * half-built: a model whose weights and centroids disagree in length would go
 * on to produce a thrust line that is simply wrong, with nothing on screen to
 * say so.
 *
 * @param {string|object} text  the file's contents, or the parsed object
 */
export function deserialise(text) {
  let data;
  if (typeof text === 'string') {
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('this is not a JSON file');
    }
  } else {
    data = text;
  }

  if (!data || data.format !== FORMAT) {
    throw new Error('this file was not saved by aLOTofImaginArches');
  }
  if (!(data.version <= VERSION)) {
    throw new Error(
      `this file was saved by a later version (${data.version}); `
      + `this one reads up to ${VERSION}`,
    );
  }

  const m = data.model;
  if (m) {
    const n = (m.centroids ?? []).length;
    if (n) {
      for (const [key, want] of [['weights', n], ['areas', n], ['thickness', n],
        ['blocks', n]]) {
        const got = (m[key] ?? []).length;
        if (got !== want) {
          throw new Error(
            `the file is inconsistent: ${got} ${key} against ${n} blocks`,
          );
        }
      }
      // NO JOINTS IS A STATE, NOT A FAULT. A Poleni dome, a section with
      // detached members, an assembly drawn by hand: none of them is a chain,
      // and the application already says so and carries on. Demanding n+1
      // joints of every file meant that any such session could be saved and
      // then never reopened -- "0 joints against 31 blocks" -- which is the
      // one thing a save format must not do. Their COUNT is still checked,
      // because every panel downstream indexes into the list.
      const nJoints = (m.joints ?? []).length;
      if (nJoints && nJoints !== n + 1) {
        throw new Error(
          `the file is inconsistent: ${nJoints} joints against ${n} blocks`,
        );
      }
    } else {
      for (const key of ['weights', 'areas', 'thickness', 'blocks']) {
        if ((m[key] ?? []).length) {
          throw new Error(`the file is inconsistent: ${key} without blocks`);
        }
      }
    }
    if (!(m.blocks ?? []).every((p) => p && p.x && p.y
      && p.x.length === p.y.length)) {
      throw new Error('the file has a malformed block');
    }
    if (m.blockGroups?.length && m.blockGroups.length !== (m.blocks ?? []).length) {
      throw new Error('the file has malformed block groups');
    }
  }

  const f = data.forces;
  if (f && (f.points ?? []).length !== (f.magnitudes ?? []).length) {
    throw new Error('the file has a force without a magnitude, or the reverse');
  }
  if (data.log && !Array.isArray(data.log)) {
    throw new Error('the file has a malformed project log');
  }
  if (data.image && (
    typeof data.image.dataUrl !== 'string'
    || !data.image.dataUrl.startsWith('data:image/')
  )) {
    throw new Error('the file has a malformed background image');
  }

  return {
    ...data,
    model: m
      ? {
        ...m,
        blocks: (m.blocks ?? []).map((p) => ({ x: [...p.x], y: [...p.y] })),
        // Older files wrote [] where they meant "none"; [] is truthy, so it has
        // to be normalised here or the guards downstream never fire.
        joints: m.joints?.length ? m.joints : null,
        thrustLine: null,
      }
      : null,
    forces: f ?? { points: [], magnitudes: [] },
    // Older files carry no ends at all, and must still open.
    ends: data.ends
      ? { A: data.ends.A ?? null, B: data.ends.B ?? null, imposed: !!data.ends.imposed }
      : null,
    controls: {
      thrust: 50, startPos: 50, split: 50, ...(data.controls ?? {}),
    },
    dome: { poleni: false, angleDeg: 15, axisX: 0, ...(data.dome ?? {}) },
    imageData: data.image ?? null,
    notes: String(data.notes ?? ''),
    log: (data.log ?? []).map((row) => String(row)),
  };
}

/** A file name that says what it is and when it was made. */
export function suggestedName(state) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = state.exampleName ?? state.model?.name;
  const base = name ? String(name).replace(/[^\w.-]+/g, '_') : 'arch';
  return `${base}-${stamp}.json`;
}
