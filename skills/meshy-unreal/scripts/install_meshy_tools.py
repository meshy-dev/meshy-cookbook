#!/usr/bin/env python3
"""Install/check/remove the bundled MeshyTools in one Unreal project. No network or credentials."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import tempfile

SKILL = Path(__file__).resolve().parents[1]
BEGIN = '# BEGIN MESHY TOOLS (managed)'
END = '# END MESHY TOOLS (managed)'
BLOCK = BEGIN + '\nimport meshy_toolset\nmeshy_toolset.register()\n' + END + '\n'


def project_root(path):
    path = Path(path).expanduser().resolve()
    if path.suffix == '.uproject':
        if not path.is_file():
            raise ValueError('The .uproject file does not exist')
        return path.parent
    if not path.is_dir() or len(list(path.glob('*.uproject'))) != 1:
        raise ValueError('Pass a .uproject file, or a folder containing exactly one .uproject')
    return path


def confined(root, relative):
    path = root / relative
    if not path.resolve().is_relative_to(root) or any(p.is_symlink() for p in [path, *path.parents] if p != root):
        raise ValueError(f'Refusing symlink/escaping path: {path}')
    return path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


@contextmanager
def lock_project(root):
    lock = confined(root, 'MeshyAssets/.install-lock')
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        lock.mkdir()
    except FileExistsError:
        raise ValueError('Another installer owns .install-lock; resolve an interrupted install before removing it')
    try:
        yield
    finally:
        lock.rmdir()


def install(project, action='install'):
    root = project_root(project)
    source = SKILL / 'assets/meshy_toolset.py'
    manifest = json.loads((SKILL / 'assets/meshy-tools.json').read_text())
    payload = source.read_bytes()
    if digest(payload) != manifest['sha256']:
        raise ValueError('Bundled MeshyTools checksum mismatch; reinstall the skill')
    compile(payload, str(source), 'exec')
    target = confined(root, 'Content/Python/meshy_toolset.py')
    init = confined(root, 'Content/Python/init_unreal.py')
    state = confined(root, 'Content/Python/.meshy-tools.json')
    if action == 'check':
        managed = json.loads(state.read_text()) if state.exists() else None
        installed_hash = digest(target.read_bytes()) if target.exists() else None
        init_ok = init.exists() and BLOCK in init.read_text()
        return {'installed': target.exists(), 'managed': managed is not None,
                'unmodified': bool(managed and installed_hash == managed['sha256']),
                'current': installed_hash == manifest['sha256'] and init_ok,
                'version': managed.get('version') if managed else None, 'project': str(root)}
    if action not in ('install', 'remove'):
        raise ValueError('Unknown action')
    with lock_project(root):
        old = {p: p.read_bytes() if p.exists() else None for p in (target, init, state)}
        managed = json.loads(old[state]) if old[state] is not None else None
        if old[target] is not None and (not managed or digest(old[target]) != managed['sha256']):
            raise ValueError('Existing toolset is unmanaged or edited; back it up and resolve ownership before installing/removing')
        init_text = (old[init] or b'').decode('utf-8')
        if init_text.count(BEGIN) != init_text.count(END) or init_text.count(BEGIN) > 1:
            raise ValueError('Invalid managed block in init_unreal.py; resolve it before continuing')
        if BEGIN in init_text:
            start = init_text.index(BEGIN)
            end = init_text.index(END, start) + len(END)
            if init_text[end:end + 1] == '\n':
                end += 1
            if init_text[start:end] != BLOCK:
                raise ValueError('Managed startup block was edited; preserve and resolve it first')
            clean = init_text[:start] + init_text[end:]
        else:
            clean = init_text
        if 'import meshy_toolset' in clean or 'from meshy_toolset' in clean:
            raise ValueError('Legacy/custom MeshyTools import found; back it up and remove that import before installing')
        if action == 'remove':
            if not managed:
                raise ValueError('No managed installation to remove')
            new = {target: None, init: clean.encode(), state: None}
        else:
            new_init = clean + ('' if not clean or clean.endswith('\n') else '\n') + BLOCK
            new = {target: payload, init: new_init.encode(),
                   state: (json.dumps(manifest, indent=2) + '\n').encode()}
        # Backups contain only prior tool/startup code, never credentials. Keep for manual rollback.
        if any(old[p] != new[p] for p in old):
            for p, data in old.items():
                if data is not None:
                    backup = confined(root, 'MeshyAssets/toolset-backups/' + digest(data) + '-' + p.name)
                    atomic_write(backup, data)
        try:
            for p, data in new.items():
                if data is None:
                    p.unlink(missing_ok=True)
                elif data != old[p]:
                    atomic_write(p, data)
        except Exception:
            for p, data in old.items():
                if data is None:
                    p.unlink(missing_ok=True)
                else:
                    atomic_write(p, data)
            raise
    return {'action': action, 'project': str(root), 'version': manifest['version'],
            'sha256': manifest['sha256'], 'restart_or_register_required': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--action', choices=('install', 'check', 'remove'), default='install')
    args = parser.parse_args()
    print(json.dumps(install(args.project, args.action), indent=2))


if __name__ == '__main__':
    main()
