"""Opt-in local-file Unreal smoke test. Run only in a disposable project via its Python tool."""
from __future__ import annotations
import json
from pathlib import Path
import uuid


def _cube(width):
    vertices = [(x, y, z) for z in (0, 1) for y in (-1, 1) for x in (-width, width)]
    faces = [(1, 3, 4, 2), (5, 6, 8, 7), (1, 2, 6, 5),
             (3, 7, 8, 4), (1, 5, 7, 3), (2, 4, 8, 6)]
    # Explicit UVs avoid the 5.9 OBJ translator's missing-UV ensure.
    return '\n'.join(['o MeshySmokeCube'] + ['v %s %s %s' % v for v in vertices] +
                     ['vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1'] +
                     ['f ' + ' '.join(f'{v}/{i + 1}' for i, v in enumerate(face)) for face in faces]) + '\n'


def run(project, include_placement=True):
    import unreal
    import meshy_toolset
    root = Path(project).resolve()
    actual = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())).resolve()
    if root != actual:
        raise ValueError('Connected editor is not the requested project')
    if not (root / 'MeshyAssets/ALLOW_SMOKE_TESTS').is_file():
        raise ValueError('Use a disposable project and create MeshyAssets/ALLOW_SMOKE_TESTS first')
    run_id = uuid.uuid4().hex
    output = root / 'MeshyAssets/smoke' / run_id
    output.mkdir(parents=True)
    source = output / 'cube.obj'
    source.write_text(_cube(1))
    folder = '/Game/MeshySmoke/' + run_id
    report = {'run_id': run_id, 'engine': unreal.SystemLibrary.get_engine_version(),
              'toolset': meshy_toolset.MESHY_TOOLSET_VERSION, 'checks': [],
              'folder': folder, 'save_state': 'save_pending',
              'scope': 'editor-placement-and-assets' if include_placement else 'assets-only',
              'placement_tested': False}
    tools = meshy_toolset.MeshyTools
    try:
        first = json.loads(tools.import_model(str(source), folder, 'cube'))
        assert len(first['static_meshes']) == 1, first
        mesh_path = first['static_mesh']
        report['mesh'] = mesh_path
        report['checks'].append('local OBJ import')
        actor = None
        if include_placement:
            placed = json.loads(tools.place_at_transform(mesh_path, [123, 234, 345], [0, 35, 0], [1, 1, 1]))
            report['actor'] = placed['actor_path']
            actor = unreal.find_object(None, placed['actor_path'])
            assert actor is not None
            loc = actor.get_actor_location()
            assert abs(loc.x - 123) < .1 and abs(loc.z - 345) < .1
            assert abs(actor.get_actor_rotation().yaw - 35) < .1
            report['checks'].append('explicit transform without ground snapping')
            report['placement_tested'] = True
        # Preserve both fixtures; import staging alone is replaced.
        (output / 'original.obj').write_text(source.read_text())
        source.write_text(_cube(2))
        second = json.loads(tools.import_model(str(source), folder, 'cube', True))
        assert second['static_mesh'] == mesh_path, (first, second)
        assert second['size_cm'][0] > first['size_cm'][0] * 1.5, (first, second)
        if actor:
            assert actor.static_mesh_component.static_mesh.get_path_name().split('.')[0] == mesh_path
            report['checks'].append('actor reference preserved')
        report['checks'].append('reimport preserved mesh path; bounds changed')
        report['passed'] = True
    except Exception as exc:
        report['passed'] = False
        report['error'] = repr(exc)
        raise
    finally:
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report
