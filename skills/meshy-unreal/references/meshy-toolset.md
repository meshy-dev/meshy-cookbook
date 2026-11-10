# MeshyTools: installation and editor operations

MeshyTools is a versioned Python editor integration, not a Meshy API client. Its maintained
[source](../assets/meshy_toolset.py) and [checksum manifest](../assets/meshy-tools.json) ship with
this skill. Copy/install the file; do not regenerate it from prose. Version 5 adds explicit
transform placement, disambiguates PlayerStarts/actor labels, and reports unsaved results.
See [validation](validation.md) for the distinction between local tests and engine certification.

## Install, check, update and remove

The [installer](../scripts/install_meshy_tools.py) needs Python 3.11+ with its standard library.
Use the host's Python (`python3` on macOS/Linux, `py -3` on Windows) with arguments
`--project PROJECT_UPROJECT --action install`. `PROJECT_UPROJECT` is an absolute `.uproject` path;
quote paths as individual arguments. The installer resolves the bundled source relative to
itself, verifies its hash, copies it to `Content/Python/meshy_toolset.py`, and inserts a managed
startup block into `Content/Python/init_unreal.py`. Other startup code is preserved.

When only Unreal's embedded Python is available, use its discovered `execute_python` tool:

```python
import runpy
installer = runpy.run_path("ABSOLUTE_SKILL_PATH/scripts/install_meshy_tools.py")
installer["install"]("ABSOLUTE_PROJECT_PATH/Game.uproject", "install")
```

The same callable accepts `check` and `remove`; shell invocation uses `--action check` or
`--action remove`. Check reports installed/managed/unmodified/current and the recorded version.
Install/remove refuse symlink targets, unowned files and edited managed files. Prior code and
startup files are backed up by content hash in `MeshyAssets/toolset-backups/`. Inspect a refusal;
never silently discard a user's modifications. For a legacy version 4 installation, back up
and review its source and old three-line startup import, remove just that reviewed legacy
installation, then run the installer. Do not append a second import.

After installation, register it in the running editor:

```python
import sys, unreal
p = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()) + "Python"
if p not in sys.path:
    sys.path.append(p)
import meshy_toolset
meshy_toolset.register()
meshy_toolset.MESHY_TOOLSET_VERSION
```

If an earlier version is already loaded, call its `reload` after installing, wait for the next
editor tick, then call `version`. Compare the result with the manifest. If Python/toolsets are
unavailable (including the 5.8 first-install path), ask the user to save and restart once.
Removing files does not unload a running toolset: save and restart after removal.

The installer does not alter `.uproject` plugins, log in, save Unreal packages or restart the
editor. Follow [setup](unreal-setup.md) for those separate steps. A client without local file
access needs a person or local agent to install it before using the tools.

## Tools and limits

Call through Unreal MCP's discovered schema. On 5.9 this is `call_tool` with `toolset_name`
`meshy_toolset.MeshyTools`, `tool_name` and `arguments`. Send editor calls serially. A timeout is
an uncertain result: inspect the destination folder/actors before repeating a mutating call.
A response explicitly saying the call did not run may be retried once the editor is ready.

| Tool | Use and limits |
|---|---|
| `import_model` | Static meshes via Interchange. Reports all imported paths and `static_meshes`; when `selection_required` is true, choose the intended mesh instead of assuming the first one is the whole model. Inspect scale, materials, Nanite and collision; project pipeline defaults vary. |
| `import_character` | Rigged FBX and its skeleton/materials. The tested Meshy rigged GLB had a 100× scale discrepancy; FBX is the characterized path, not a claim about every GLB. |
| `import_animation` | Clips on an existing skeleton. Inspect existing clips before retrying; it does not implement transactional reimport. |
| `retarget_animations` | Advanced humanoid workflow; template paths and bones must exist. Inspect `root_motion.set` and each `travel_ok`; false or unknown requires investigation, not a success claim. |
| `spot_near_player_start` | Optional convenience. If there are multiple starts pass `player_start_path`; if there is none use a selected actor, surface or explicit transform. |
| `place_model`, `place_character` | Floor-standing objects only; `floor_hint_z_cm` supplies an approximate elevation. Traces can hit a roof/another floor: verify `stands_on` in multi-level scenes. |
| `place_at_transform` | World location `[x,y,z]` cm, rotation `[pitch,yaw,roll]` degrees, positive scale `[x,y,z]`; no ground snapping. Use for floating/hanging/surface-oriented assets. |
| `check_actors` | Prefer full actor paths; ambiguous labels are rejected. An empty list checks meshes under `/Game/Meshy/` only. Ground gaps and bounding-box overlaps are heuristics. Attached props intentionally ignore ground checks. |
| `version`, `reload` | Inspect/reload the installed version. |

For a socket attachment, discover the editor's attachment tools and socket/bone names, set the
requested relative transform, and inspect it in motion. For surface alignment, inspect the
surface normal and use a full transform. Native tools are appropriate; do not force a ground
placement tool into these tasks. Preserve intentional intersections and slopes.

All placements are undoable editor transactions. Imports and retargeting may create multiple
assets; they are not a transaction rollback mechanism. Tools do not save packages. Record the
returned paths, inspect the outcome, then checkpoint saves as in [validation](validation.md).

## Updating an existing asset

1. Keep the previous revision's local source, task IDs, exact settings and imported paths.
   Inspect actors and Blueprint/material references using the shared mesh. Replacing a shared
   mesh affects all its instances; duplicate into a new destination if only one should change.
2. Download the new result to a **new revision folder** with the same basename, for example
   `MeshyAssets/crate/REVISION/crate.glb`. A new task cannot use `wait -o` to overwrite a previous
   task's output. Use a distinct path; if a user explicitly chooses a destructive replacement,
   `meshy download` supports `--overwrite` but `wait -o` does not bypass this refusal.
3. Keep a stable import staging path, e.g. `MeshyAssets/import/crate/crate.glb`. Copy the verified
   revision's file there after preserving the previous revision. For glTF/OBJ/FBX with external
   resources, stage the complete resource bundle without breaking its relative paths.
4. Call the same import tool with the same staging source, `folder_path` and `asset_name`, and
   `replace_existing` true. Record **returned** paths; verify they match the intended existing
   assets. Do not infer success from the flag or import return alone.
5. Check scale, materials and affected actors. Verify animation compatibility when replacing a
   character; a changed skeleton can invalidate existing clips/Blueprints. If the result fails,
   restore the prior staging bundle and reimport, or use a separate candidate destination first.
6. Mark `save_pending`, save the accepted assets/level at a checkpoint, and record confirmation.
   Do not delete the previous source or revision history after a successful update.
