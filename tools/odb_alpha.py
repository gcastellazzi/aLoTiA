# -*- coding: utf-8 -*-
"""The activation multiplier and the collapse mechanism, read off an Abaqus odb.

    abaqus python tools/odb_alpha.py job.odb [job.inp] [-o alpha.json]
                                     [-s step] [-a alphaMax]

WHAT IT IS FOR. The application computes the multiplier of a lateral action
proportional to the masses by the kinematic theorem, and the hinges of the
mechanism that activates it. The deck it exports, with the lateral step asked
for, puts the same question to Abaqus: gravity is held and a body force
rho * g * alphaMax is ramped over a step of unit duration, so the step time IS
the multiplier divided by that ceiling. This script reads the answer back.

WHAT IT REPORTS.

  alpha_last      alphaMax times the step time of the last converged frame.
                  An analysis that ran to the end of the step did not collapse,
                  and this is a lower bound, not the multiplier.
  alpha_motion    alphaMax times the step time at which the kinetic energy
                  first rises above a fraction of the internal energy. In a
                  quasi-static step the blocks are still until the mechanism
                  forms, so this is the multiplier, and it is read off the
                  energy balance rather than off the increment the solver gave
                  up on -- which is a property of the time stepping, not of the
                  arch.
  joints          per joint, how far it opened AT THE ONSET OF THE MOTION and
                  where. The frame matters: an implicit quasi-static step runs
                  happily through a collapse, so at the end of it the arch is
                  not a mechanism but a heap, every joint wide open at both
                  ends and no hinge to be read. At the onset each hinging joint
                  is open at one end and still shut at the other, which is what
                  a hinge is. The whole evolution goes into the JSON so the
                  choice can be checked rather than trusted.
                  The exported deck makes the LO face of each block the slave
                  surface of the pair with the block below it, so a contact
                  opening reported on the instance of block k belongs to the
                  joint between blocks k-1 and k. The node that opened most and
                  the node that opened least are both given with their
                  coordinates: the end that stays shut is the hinge, and which
                  face it sits on follows from the geometry of the section.

THE HINGES ARE NOT NAMED HERE. Intrados and extrados are properties of the
section, which this file does not contain; the openings are reported as
coordinates and tools/compare_alpha.mjs puts them against the session that
produced the deck. Nothing here decides anything the odb does not say.

WITHOUT THE LATERAL STEP there is no multiplier to read, and the script says
so rather than failing: the step the deck does carry is still opened and the
joints that parted are still reported. That is one of the three readings the
comparison wants, and an analysis already run should not have to be run again
to give it up.

Runs under the Python that ships with Abaqus, 2.7 as in 6.14 or 3.x alike.
"""

from __future__ import print_function

import json
import re
import sys

from odbAccess import openOdb


REVISION = 5                # printed, so a stale copy is visible at once
STEP = 'Lateral_action'
KE_FRACTION = 1.0e-3        # ALLKE / ALLIE above which the blocks are moving


def read_deck(path):
    """alphaMax, the direction and the kinematic value, from the deck's comments.

    THE DECK HAS TO BE THE ONE THE APPLICATION WROTE. Abaqus/CAE, asked to
    write the input file of a job, writes its own: the model survives but every
    comment is stripped, and these three numbers live in comments. A deck that
    has been through CAE therefore says nothing about alphaMax, and the value
    has to be given with -a instead.
    """
    out = {}
    keys = {
        'ALOTIA_ALPHA_MAX': 'alpha_max',
        'ALOTIA_ALPHA_DIRECTION': 'direction',
        'ALOTIA_ALPHA_KINEMATIC': 'alpha_kinematic',
    }
    text = open(path).read()
    for key, name in keys.items():
        found = re.search(r'\*\*\s*' + key + r'\s*=\s*([-\d.eE+]+)', text)
        if found:
            out[name] = float(found.group(1))
    return out


def lookup(repository, name):
    """One member of an Abaqus repository, or None.

    ASK FOR IT, DO NOT TEST FOR IT. A repository is dict-like, but how much of
    the mapping protocol it implements has changed between versions: on 6.14
    `name in repo.keys()` finds nothing where `repo[name]` returns the member,
    and a membership test that quietly answers no turns every joint of a
    collapsed arch into a joint that never opened. Subscripting and catching
    the failure cannot be wrong in either direction.
    """
    try:
        return repository[name]
    except Exception:
        return None


def history(step, name):
    """One history output of the whole model, as a list of (time, value)."""
    for key in step.historyRegions.keys():
        region = step.historyRegions[key]
        got = lookup(region.historyOutputs, name)
        if got is not None:
            return list(got.data)
    return []


def when_motion_starts(step, fraction=KE_FRACTION):
    """The step time at which the kinetic energy leaves zero, or None."""
    ke = history(step, 'ALLKE')
    ie = history(step, 'ALLIE')
    if not ke or not ie:
        return None
    internal = dict(ie)
    for t, k in ke:
        total = abs(internal.get(t, 0.0))
        if total > 0.0 and abs(k) > fraction * total:
            return t
    return None


def block_of(instance_name):
    """The block number an instance belongs to: BLOCK_7_I or BLOCK_7_S3 -> 7."""
    found = re.match(r'BLOCK_(\d+)_', instance_name)
    return int(found.group(1)) if found else None


def openings(frame, coords, orphans):
    """The contact opening of every joint at one frame.

    COPEN lives on the nodes of the slave surface, and the slave surface of
    every pair in an exported deck is the LO face of the upper block, so the
    instance a value sits on names the joint. A value is kept only where the
    surfaces actually parted: a closed node reports zero or a small negative
    penetration, and reporting those as openings would make every joint a
    hinge.
    """
    field = lookup(frame.fieldOutputs, 'COPEN')
    if field is None:
        orphans[2] += 1
        return {}
    per_joint = {}
    for value in field.values:
        instance = value.instance
        if instance is None:
            # A contact value is expected to carry the instance its node is on.
            # If this ever counts up, the assumption is wrong on this version
            # and the openings would silently come back empty -- so it is
            # counted and printed rather than passed over.
            orphans[0] += 1
            continue
        block = block_of(instance.name)
        if block is None or block < 2:
            orphans[1] += 1
            continue
        joint = block - 1                      # joints[joint] separates block-1 | block
        gap = float(value.data)
        if instance.name not in coords:
            # The coordinates of a whole instance, read once: the openings are
            # reported by node label and the label alone says nothing about
            # where on the joint the masonry parted.
            # float() throughout: Abaqus hands out its own float type, which
            # json refuses to serialise -- "23.723166 is not JSON
            # serializable" -- and the failure comes only at the very end,
            # after the whole odb has been read.
            coords[instance.name] = dict(
                (int(n.label), [float(c) for c in n.coordinates])
                for n in instance.nodes
            )
        point = coords[instance.name].get(int(value.nodeLabel))
        row = per_joint.setdefault(joint, {'max': None, 'min': None, 'nodes': 0})
        row['nodes'] += 1
        entry = {'gap': gap, 'node': int(value.nodeLabel),
                 'instance': instance.name,
                 'point': [point[0], point[2]] if point else None}
        if row['max'] is None or gap > row['max']['gap']:
            row['max'] = entry
        if row['min'] is None or gap < row['min']['gap']:
            row['min'] = entry
    return per_joint


def scan(step, orphans):
    """Every frame of the step: its time and how far each joint had parted."""
    coords = {}
    rows = []
    for frame in step.frames:
        got = openings(frame, coords, orphans)
        if not got and orphans[2] == 1:
            # Said once, with what the frame does carry: a missing contact
            # output is the difference between reading a mechanism and reading
            # an arch that never moved, and it must not pass in silence.
            orphans[2] += 1
            print('COPEN is not in the field output at step time %g.'
                  % float(frame.frameValue))
            print('This frame carries: %s'
                  % ', '.join([str(k) for k in frame.fieldOutputs.keys()]))
            print('Ask the deck for CDISP on the contact pairs, which carries'
                  ' COPEN.')
        rows.append({
            't': float(frame.frameValue),
            'joints': got,
        })
    scale = 1.0
    points = [p for table in coords.values() for p in table.values()]
    if points:
        for axis in (0, 2):
            span = max(p[axis] for p in points) - min(p[axis] for p in points)
            scale = max(scale, span)
    return rows, scale


def widest(row):
    """The joints of one frame, widest opening first."""
    out = [(joint, data['max']['gap'], data['min']['gap'])
           for joint, data in row['joints'].items()
           if data['max'] is not None and data['min'] is not None]
    out.sort(key=lambda item: -item[1])
    return out


def mark_hinges(row, scale, tol=1.0e-5, shut=0.05):
    """Which of the parted joints are hinges, and which are separations.

    A HINGE IS OPEN AT ONE END AND SHUT AT THE OTHER. That is the whole content
    of the word: the two blocks still bear on one another along the line the
    rotation is about. A joint whose far end has also lifted is not a hinge but
    a block coming away, and counting it as one would read a mechanism of five
    or six hinges off an arch that has three.
    """
    for data in row['joints'].values():
        if data['max'] is None or data['min'] is None:
            continue
        wide = data['max']['gap']
        narrow = data['min']['gap']
        data['parted'] = bool(wide > tol * scale)
        data['hinge'] = bool(data['parted'] and narrow < shut * wide)
    return row


def onset_of(rows, scale, tol=1.0e-5):
    """The first frame at which any joint has parted measurably.

    THE THRESHOLD IS RELATIVE TO THE ARCH, not absolute: an opening is a length
    and a ring of radius 27 does not part by the same amount as one of radius
    0.3. Below it the number is the elastic shortening of the contact and the
    noise of the solver, not a joint that has opened.
    """
    for index, row in enumerate(rows):
        hits = widest(row)
        if hits and hits[0][1] > tol * scale:
            return index
    return None


def main(argv):
    out_path = None
    want_step = None
    given_alpha = None
    for flag, target in (('-o', 'out'), ('-s', 'step'), ('-a', 'alpha')):
        if flag in argv:
            at = argv.index(flag)
            value = argv[at + 1]
            argv = argv[:at] + argv[at + 2:]
            if target == 'out':
                out_path = value
            elif target == 'step':
                want_step = value
            else:
                given_alpha = float(value)
    print('odb_alpha.py revision %d' % REVISION)
    if not argv:
        print(__doc__)
        return 2
    odb_path = argv[0]
    deck = read_deck(argv[1]) if len(argv) > 1 else {}
    if given_alpha is not None:
        deck['alpha_max'] = given_alpha
    elif len(argv) > 1 and 'alpha_max' not in deck:
        print('%s carries no ALOTIA_ALPHA_MAX comment. A deck rewritten by'
              % argv[1])
        print('Abaqus/CAE has had its comments stripped: use the file the')
        print('application exported, or give the number with -a.')

    odb = openOdb(odb_path, readOnly=True)
    try:
        names = list(odb.steps.keys())
        step_name = want_step or STEP
        lateral = step_name in names
        if not lateral:
            # The deck was written before the lateral step existed, or the step
            # was not asked for. The multiplier cannot be recovered -- there is
            # no ramped action whose level the step time measures -- but the
            # joints that parted can, and they are a third of the comparison.
            step_name = names[-1] if names else None
            if step_name is None:
                print('%s carries no step at all' % odb_path)
                return 1
            print('%s has no step named %s; it carries %s.'
                  % (odb_path, want_step or STEP, ', '.join(names)))
            print('Reading %s instead: the joints that parted are reported, the'
                  % step_name)
            print('multiplier is not. For the multiplier, export the model again')
            print('with the lateral step asked for (the "lateral alpha" box).')
            print('')
        step = odb.steps[step_name]
        frames = list(step.frames)
        if not frames:
            print('the lateral step has no frame: the analysis did not start')
            return 1

        alpha_max = deck.get('alpha_max') if lateral else None
        last_time = float(frames[-1].frameValue)

        orphans = [0, 0, 0]
        rows, scale = scan(step, orphans)
        for row in rows:
            mark_hinges(row, scale)
        onset = onset_of(rows, scale)
        energy_time = when_motion_starts(step)

        result = {
            'odb': odb_path,
            'step': step_name,
            'lateral': lateral,
            'alpha_max': alpha_max,
            'direction': deck.get('direction'),
            'alpha_kinematic': deck.get('alpha_kinematic'),
            'frames': len(frames),
            'scale': scale,
            'step_time_last': last_time,
            'step_time_motion': rows[onset]['t'] if onset is not None else None,
            'step_time_energy': energy_time,
            'onset_frame': onset,
            'ran_to_end': abs(last_time - 1.0) < 1.0e-9,
            'energy': [{'t': float(t), 'allke': float(k)}
                       for t, k in history(step, 'ALLKE')],
            'joints': rows[onset]['joints'] if onset is not None else {},
            'joints_last': rows[-1]['joints'],
            'evolution': [{'t': row['t'],
                           'joints': dict((str(j), {'max': mx, 'min': mn})
                                          for j, mx, mn in widest(row))}
                          for row in rows],
        }
        # The comparison reads `joints` keyed by joint number as a string.
        result['joints'] = dict((str(j), r) for j, r in result['joints'].items())
        result['joints_last'] = dict((str(j), r)
                                     for j, r in result['joints_last'].items())
        if alpha_max is not None:
            result['alpha_last'] = alpha_max * last_time
            if result['step_time_motion'] is not None:
                result['alpha_motion'] = alpha_max * result['step_time_motion']
            if energy_time is not None:
                result['alpha_energy'] = alpha_max * energy_time
            # The bracket the frame spacing leaves. The onset happened between
            # the last frame that was still at rest and the first that was not,
            # and quoting the upper end alone would claim a resolution the
            # output interval does not have.
            before = None
            for name in ('onset_frame',):
                index = result[name]
                if index:
                    before = rows[index - 1]['t']
            if before is None and energy_time is not None:
                earlier = [r['t'] for r in rows if r['t'] < energy_time]
                before = earlier[-1] if earlier else None
            if before is not None:
                result['step_time_before'] = before
                result['alpha_before'] = alpha_max * before

        # ---------------------------------------------------------- the report
        print('%s, step %s: %d frames, step time %.4f to %.4f'
              % (odb_path, step_name, len(frames), rows[0]['t'], last_time))
        if orphans[0] or orphans[1]:
            print('COPEN: %d value(s) carried no instance, %d sat on no numbered'
                  ' block.' % (orphans[0], orphans[1]))
        if result['ran_to_end']:
            # An implicit quasi-static step does not stop when the arch gives
            # way: the blocks move, the solver keeps converging, and the step
            # reaches its end. Completion is not evidence of standing, and the
            # openings below say which it was.
            print('the step ran to its end, which an implicit quasi-static step')
            print('does whether or not the arch gave way: see the openings.')

        print('')
        print('how the joints opened, frame by frame (the four widest of each):')
        for index, row in enumerate(rows):
            hits = widest(row)[:4]
            mark = ' <- onset' if index == onset else ''
            alpha_here = ('a=%.4f ' % (alpha_max * row['t'])) if alpha_max else ''
            print('  t=%.4f %s%s%s'
                  % (row['t'], alpha_here,
                     '  '.join('j%d %.3g/%.3g' % (j, mx, mn) for j, mx, mn in hits)
                     or 'nothing open',
                     mark))

        print('')
        if onset is None:
            print('no joint ever parted by more than 1e-5 of the arch: no')
            print('mechanism formed, and the multiplier is above the ceiling of')
            print('the ramp. Export again with a larger alphaMax.')
        else:
            print('at the onset, frame %d, step time %.4f:'
                  % (onset, rows[onset]['t']))
            print('  a joint open at one end and shut at the other is a hinge,')
            print('  and the point given is the end that stayed shut --- which')
            print('  is where the hinge is.')
            for joint, mx, mn in widest(rows[onset]):
                row = result['joints'][str(joint)]
                if not row.get('parted'):
                    continue
                where = row['min']['point'] or [float('nan')] * 2
                print('  joint %-3d opened %.6g, far end %.3g at (%.4f, %.4f)  %s'
                      % (joint, mx, mn, where[0], where[1],
                         'HINGE' if row.get('hinge') else 'open at both ends'))
            hinges = [j for j, r in result['joints'].items() if r.get('hinge')]
            print('  %d hinge(s), %d joint(s) parted at both ends'
                  % (len(hinges),
                     len([1 for r in result['joints'].values()
                          if r.get('parted') and not r.get('hinge')])))

        print('')
        if alpha_max is None:
            if lateral:
                print('alphaMax is not known, so the step time cannot be scaled'
                      ' into')
                print('a multiplier: pass the .inp beside the .odb.')
        else:
            if result.get('alpha_motion') is not None:
                print('alpha at the onset of the motion:   %.6f'
                      % result['alpha_motion'])
            print('alpha at the last frame:            %.6f' % result['alpha_last'])
            if energy_time is not None:
                print('alpha where ALLKE leaves zero:      %.6f'
                      % (alpha_max * energy_time))
            if result.get('alpha_before') is not None:
                print('the onset lies between %.6f and %.6f: the frames are that'
                      % (result['alpha_before'],
                         result.get('alpha_motion') or result.get('alpha_energy')))
                print('far apart, and no reading is sharper than the spacing.')
            # NOT alpha_last. If the step ran to its end, alpha_last is
            # the ceiling of the ramp and nothing else: a number chosen before
            # the analysis, which would then be reported as its result.
            got = result.get('alpha_motion') or result.get('alpha_energy')
            if result.get('alpha_kinematic') is not None:
                k = result['alpha_kinematic']
                if got is None:
                    print('alpha from the kinematic theorem:   %.6f' % k)
                    print('Abaqus gave no multiplier to compare: nothing opened'
                          ' and the')
                    print('energy never rose, so the arch stood to the ceiling'
                          ' of the ramp.')
                else:
                    print('alpha from the kinematic theorem:   %.6f  '
                          '(Abaqus is %+.2f%% of it)'
                          % (k, 100.0 * (got / k - 1.0)))

        if out_path:
            handle = open(out_path, 'w')
            try:
                json.dump(result, handle, indent=1, sort_keys=True)
            finally:
                handle.close()
            print('wrote %s' % out_path)
        return 0
    finally:
        odb.close()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
