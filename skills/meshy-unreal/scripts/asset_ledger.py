#!/usr/bin/env python3
"""Record immutable asset revisions and operation IDs; no Meshy API calls. Python standard library."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
import uuid

STATES = {'planned', 'approved', 'generating', 'downloaded', 'imported', 'placed',
          'validated', 'save_pending', 'saved', 'failed', 'interrupted', 'canceled'}
STAGE_STATES = {'submitted', 'unknown', 'succeeded', 'failed', 'canceled'}


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    fd, temp = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(value, f, indent=2, ensure_ascii=False, allow_nan=False)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def safe_token(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}', value):
        raise ValueError('Use a short identifier with letters, digits, underscores or hyphens')
    return value


def root_for(project):
    project = Path(project).expanduser().resolve()
    if project.suffix == '.uproject' and project.is_file():
        project = project.parent
    if not project.is_dir() or not list(project.glob('*.uproject')):
        raise ValueError('Pass an Unreal project folder or .uproject file')
    root = project / 'MeshyAssets/records'
    if not root.resolve().is_relative_to(project) or any(p.is_symlink() for p in [root, root.parent]):
        raise ValueError('Ledger must be inside the project without symlinks')
    root.mkdir(parents=True, exist_ok=True)
    return root


@contextmanager
def locked(project):
    root = root_for(project)
    lock = root / '.lock'
    try:
        lock.mkdir()
    except FileExistsError:
        raise ValueError('Ledger busy: wait for the writer; inspect an interrupted writer before removing .lock')
    try:
        yield root
    finally:
        lock.rmdir()


def read(root, revision):
    path = root / (safe_token(revision) + '.json')
    if path.is_symlink():
        raise ValueError('Ledger record must not be a symlink')
    return json.loads(path.read_text())


def require_owner(record, owner):
    if record['owner'] != owner:
        raise ValueError('Revision belongs to another writer; obtain an explicit handoff first')


def current_asset(root, name):
    """Derive one authoritative head under the writer lock; never guess after a merge."""
    records = [read(root, p.stem) for p in root.glob('*.json')]
    records = {r['revision']: r for r in records if r['asset'] == name}
    if not records:
        return None
    parents = [r['previous_revision'] for r in records.values() if r['previous_revision']]
    heads = set(records) - set(parents)
    if len(heads) != 1 or any(p not in records for p in parents):
        raise ValueError('Conflicting asset history: reconcile branches or missing parents before writing')
    head = records[next(iter(heads))]
    seen, cursor = set(), head
    while cursor is not None and cursor['revision'] not in seen:
        seen.add(cursor['revision'])
        cursor = records.get(cursor['previous_revision'])
    if cursor is not None or seen != set(records):
        raise ValueError('Conflicting asset history: reconcile disconnected or cyclic revisions before writing')
    return head


def require_current(root, record, owner):
    head = current_asset(root, record['asset'])
    if head['revision'] != record['revision']:
        raise ValueError('Stale revision: continue from the current asset revision ' + head['revision'])
    require_owner(head, owner)


def new_revision(project, name, owner, spec, previous=None):
    safe_token(name)
    safe_token(owner)
    # Request data is immutable. Store local input paths/task IDs, not expiring links or credentials.
    required = {'intent', 'prompt', 'inputs', 'settings', 'target', 'placement', 'approved_credits', 'stages'}
    if not isinstance(spec, dict) or not required <= spec.keys():
        raise ValueError('Specification needs ' + ', '.join(sorted(required)))
    if not isinstance(spec['prompt'], str) or not isinstance(spec['inputs'], list) or not isinstance(spec['settings'], dict):
        raise ValueError('prompt must be text, inputs a list, and settings an object')
    budget = spec['approved_credits']
    if budget is not None and (isinstance(budget, bool) or not isinstance(budget, (int, float)) or budget < 0):
        raise ValueError('approved_credits is null until authorized, or a nonnegative number')
    stages = spec['stages']
    if not isinstance(stages, dict):
        raise ValueError('stages maps unique stage names to resource names')
    for stage, resource in stages.items():
        safe_token(stage)
        safe_token(resource)
    with locked(project) as root:
        head = current_asset(root, name)
        if head and previous is None:
            raise ValueError('Asset already recorded; resume its revision or pass previous for an intentional change')
        if previous is not None:
            prior = read(root, previous)
            if prior['asset'] != name:
                raise ValueError('Previous revision belongs to another asset')
            require_current(root, prior, owner)
            if any(op['state'] in {'submitted', 'unknown'} for op in prior['operations'].values()):
                raise ValueError('Reconcile pending submissions before creating a successor revision')
        revision = str(uuid.uuid4())
        record = {'schema_version': 2, 'revision': revision, 'asset': name, 'owner': owner,
                  'created_at': now(), 'previous_revision': previous, 'spec': spec,
                  'state': 'approved' if budget is not None else 'planned',
                  'operations': {stage: {'operation_id': str(uuid.uuid4()), 'resource': resource,
                                         'state': 'planned', 'request': None, 'task_id': None}
                                 for stage, resource in stages.items()},
                  'events': []}
        atomic_json(root / (revision + '.json'), record)
        return record


def record_event(project, revision, owner, event):
    if not isinstance(event, dict) or set(event) - {'state', 'stage', 'stage_state', 'request', 'task_id',
                                                 'consumed_credits', 'files', 'assets', 'actors', 'evidence'}:
        raise ValueError('Unknown event field; the submitted specification cannot be edited')
    with locked(project) as root:
        record = read(root, revision)
        require_current(root, record, owner)
        state = event.get('state', record['state'])
        if state not in STATES:
            raise ValueError('Unknown revision state')
        if state == 'saved' and not event.get('evidence'):
            raise ValueError('Saved needs explicit evidence: user confirmation or a verified save/reopen result')
        if state == 'approved' and record['spec']['approved_credits'] is None:
            raise ValueError('Create an approved revision with its authorized budget; do not edit the old specification')
        if 'stage' in event:
            op = record['operations'][event['stage']]
            phase = event.get('stage_state')
            if phase not in STAGE_STATES:
                raise ValueError('Unknown stage state')
            request = event.get('request', op['request'])
            if not isinstance(request, dict):
                raise ValueError('Record the exact request parameters before a paid submission')
            if op['request'] is not None and request != op['request']:
                raise ValueError('Changed request needs a new revision and operation ID')
            task = event.get('task_id', op['task_id'])
            if op['task_id'] and task != op['task_id']:
                raise ValueError('A task ID cannot be replaced by another task')
            if op['state'] in {'succeeded', 'failed', 'canceled'} and phase != op['state']:
                raise ValueError('Terminal stage: a new attempt needs a new revision and authorization')
            if phase == 'succeeded' and not task:
                raise ValueError('Successful stage needs its task ID')
            if record['spec']['approved_credits'] is None:
                raise ValueError('Paid submission has no recorded authorization')
            op.update(request=request, task_id=task, state=phase)
        elif any(k in event for k in ('stage_state', 'request', 'task_id')):
            raise ValueError('Stage details require a stage name')
        record['state'] = state
        record['events'].append({'at': now(), 'owner': owner, **event})
        atomic_json(root / (revision + '.json'), record)
        return record


def handoff(project, revision, owner, next_owner):
    safe_token(next_owner)
    with locked(project) as root:
        record = read(root, revision)
        require_current(root, record, owner)
        record['owner'] = next_owner
        record['events'].append({'at': now(), 'handoff_from': owner, 'handoff_to': next_owner})
        atomic_json(root / (revision + '.json'), record)
        return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    sub = parser.add_subparsers(dest='command', required=True)
    new = sub.add_parser('new')
    new.add_argument('--name', required=True)
    new.add_argument('--owner', required=True)
    new.add_argument('--spec', required=True, help='JSON file with immutable request specification')
    new.add_argument('--previous')
    event = sub.add_parser('record')
    event.add_argument('--revision', required=True)
    event.add_argument('--owner', required=True)
    event.add_argument('--event', required=True, help='JSON file with event fields')
    show = sub.add_parser('show')
    show.add_argument('--revision', required=True)
    transfer = sub.add_parser('handoff')
    transfer.add_argument('--revision', required=True)
    transfer.add_argument('--owner', required=True)
    transfer.add_argument('--to', required=True)
    args = parser.parse_args()
    if args.command == 'new':
        result = new_revision(args.project, args.name, args.owner, json.loads(Path(args.spec).read_text()), args.previous)
    elif args.command == 'record':
        result = record_event(args.project, args.revision, args.owner, json.loads(Path(args.event).read_text()))
    elif args.command == 'handoff':
        result = handoff(args.project, args.revision, args.owner, args.to)
    else:
        result = read(root_for(args.project), args.revision)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
