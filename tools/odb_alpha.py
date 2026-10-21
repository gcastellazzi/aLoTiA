# -*- coding: utf-8 -*-
"""The activation multiplier and the collapse mechanism, read off an Abaqus odb.

    abaqus python tools/odb_alpha.py job.odb [job.inp] [-o alpha.json]

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
  joints          per joint, how far it opened at the last frame and where.
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

Runs under the Python that ships with Abaqus, 2.7 or 3.x alike.
"""

from __future__ import print_function

import json
import re
import sys

from odbAccess import openOdb


STEP = 'Lateral_action'
KE_FRACTION = 1.0e-3        # ALLKE / ALLIE above which the blocks are moving


def read_deck(path):
    """alphaMax, the direction and the kinematic value, from the deck's comments."""
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


def history(step, name):
    """One history output of the whole model, as a list of (time, value)."""
    for region in step.historyRegions.values():
        if name in region.historyOutputs:
            return list(region.historyOutputs[name].data)
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


def openings(odb, frame):
    """The contact opening of every joint at one frame.

    COPEN lives on the nodes of the slave surface, and the slave surface of
    every pair in an exported deck is the LO face of the upper block, so the
    instance a value sits on names the joint. A value is kept only where the
    surfaces actually parted: a closed node reports zero or a small negative
    penetration, and reporting those as openings would make every joint a
    hinge.
    """
    if 'COPEN' not in frame.fieldOutputs:
        return {}
    field = frame.fieldOutputs['COPEN']
    coords = {}
    per_joint = {}
    for value in field.values:
        instance = value.instance
        if instance is None:
            continue
        block = block_of(instance.name)
        if block is None or block < 2:
            continue
        joint = block - 1                      # joints[joint] separates block-1 | block
        gap = float(value.data)
        if instance.name not in coords:
            # The coordinates of a whole instance, read once: the openings are
            # reported by node label and the label alone says nothing about
            # where on the joint the masonry parted.
            coords[instance.name] = dict(
                (n.label, tuple(n.coordinates)) for n in instance.nodes
            )
        point = coords[instance.name].get(value.nodeLabel)
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


def main(argv):
    out_path = None
    if '-o' in argv:
        at = argv.index('-o')
        out_path = argv[at + 1]
        argv = argv[:at] + argv[at + 2:]
    if not argv:
        print(__doc__)
        return 2
    odb_path = argv[0]
    deck = read_deck(argv[1]) if len(argv) > 1 else {}

    odb = openOdb(odb_path, readOnly=True)
    try:
        if STEP not in odb.steps:
            print('%s has no step named %s; it carries %s'
                  % (odb_path, STEP, ', '.join(odb.steps.keys())))
            print('Export the model again with the lateral step asked for.')
            return 1
        step = odb.steps[STEP]
        frames = list(step.frames)
        if not frames:
            print('the lateral step has no frame: the analysis did not start')
            return 1

        alpha_max = deck.get('alpha_max')
        last_time = frames[-1].frameValue
        motion_time = when_motion_starts(step)

        result = {
            'odb': odb_path,
            'step': STEP,
            'alpha_max': alpha_max,
            'direction': deck.get('direction'),
            'alpha_kinematic': deck.get('alpha_kinematic'),
            'frames': len(frames),
            'step_time_last': last_time,
            'step_time_motion': motion_time,
            'completed': abs(last_time - 1.0) < 1.0e-9,
            'energy': [{'t': t, 'allke': k} for t, k in history(step, 'ALLKE')],
            'joints': {},
        }
        if alpha_max is not None:
            result['alpha_last'] = alpha_max * last_time
            if motion_time is not None:
                result['alpha_motion'] = alpha_max * motion_time

        for joint, row in openings(odb, frames[-1]).items():
            result['joints'][str(joint)] = row

        # ---------------------------------------------------------- the report
        print('%s, step %s: %d frames, last step time %.6f%s'
              % (odb_path, STEP, len(frames), last_time,
                 ' (ran to the end: the arch did not collapse)'
                 if result['completed'] else ''))
        if alpha_max is None:
            print('alphaMax is not known: pass the .inp beside the .odb, or the'
                  ' multiplier cannot be scaled out of the step time.')
        else:
            print('alpha at the last converged frame: %.6f' % result['alpha_last'])
            if motion_time is None:
                print('the kinetic energy never rose: no mechanism formed.')
            else:
                print('alpha where the motion begins:      %.6f  (step time %.4f)'
                      % (result['alpha_motion'], motion_time))
            if result.get('alpha_kinematic') is not None:
                k = result['alpha_kinematic']
                got = result.get('alpha_motion', result['alpha_last'])
                print('alpha from the kinematic theorem:   %.6f  '
                      '(Abaqus is %+.2f%% of it)' % (k, 100.0 * (got / k - 1.0)))
        parted = [(int(j), r['max']['gap']) for j, r in result['joints'].items()
                  if r['max'] and r['max']['gap'] > 0.0]
        parted.sort(key=lambda row: -row[1])
        if parted:
            print('joints that parted, widest first:')
            for joint, gap in parted:
                row = result['joints'][str(joint)]
                where = row['max']['point']
                print('  joint %-3d opened %.6g at (%.4f, %.4f), least %.3g'
                      % (joint, gap, where[0] if where else float('nan'),
                         where[1] if where else float('nan'),
                         row['min']['gap'] if row['min'] else float('nan')))
        else:
            print('no joint parted at the last frame.')

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
