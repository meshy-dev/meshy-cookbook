# Verification and release evidence

Local Python tests validate installation, record ownership/revisions and helper behavior. They
cannot establish Unreal API compatibility, rendering, collision or packaged-game behavior.
Every new engine build/toolset release needs the matrix below. Never label a pending run passed.

## During normal asset work

| Requested use | Useful acceptance checks |
|---|---|
| Import only | Intended Content Browser paths, complete materials/resources, measured scale, saved assets |
| Decoration | Requested placement/orientation, appearance in the intended lighting/camera, saved level/assets |
| Wall/ceiling/floating prop | Full transform or attachment, deliberate clearance/intersection; ground gap is irrelevant |
| Doorway/modular piece | Dimensions/pivot, snapping, intentional joins, player passage and appropriate collision |
| Pickup/physics prop | Correct visual and collision; verify requested interaction/physics in play when implemented |
| Animated character | Skeleton/clip compatibility, facing, deformation, root/capsule alignment; player integration only if requested |
| Mobile/web/large scene | Actual mesh/texture/material cost, target renderer, frame time and packaged result when within scope |

Use `CaptureEditorViewport` from a useful angle; base-color mode separates texture errors from
lighting. Inspect a second view if occlusion makes the first ambiguous. A thumbnail cannot prove
collision, topology or performance. Overlap reports use bounding boxes and may flag correct
arrangements; treat them as prompts to inspect, not automatic instructions to delete actors.

## Save checkpoints and recovery

After an accepted asset or small batch, list the specific changed asset packages and level.
MeshyTools deliberately does not save during import/placement. Default to a manual checkpoint:
ask the user to save new/modified assets and the current level, and record their confirmation.
Avoid Save All when unrelated dirty work should remain untouched. If an existing save path has
already been verified noninteractive for this project/build, it can be used within the user's
scope; record its result. An untitled level needs the user's destination decision first.

Mark `save_pending` until confirmed; a tool return or visible actor alone is not persistence.
On restart/crash, inspect the recorded package/actor paths and restore only missing work from
retained sources. Keep remote task IDs; a missing Unreal package is not a reason to pay again.
Don't automatically reload a level or restart the editor to prove a save in a user's working
project. For release testing use a disposable project and reopen after saving.

## Maintainer smoke test (no Meshy API or credits)

Use a disposable Unreal project and a scratch level. Create `MeshyAssets/ALLOW_SMOKE_TESTS` as
an explicit opt-in marker; this is not a test to run in a user's game automatically. Install
MeshyTools with the bundled installer, then use the editor's Python tool:

```python
import runpy
smoke = runpy.run_path("ABSOLUTE_SKILL_PATH/scripts/unreal_smoke.py")
smoke["run"]("ABSOLUTE_PROJECT_DIRECTORY")
```

The [smoke script](../scripts/unreal_smoke.py) verifies the connected project, creates a tiny local
OBJ, imports into a unique `/Game/MeshySmoke/` folder, places it at an explicit transform and
reimports a changed source. It checks mesh-path/reference preservation and changed bounds.
It makes no API requests, saves no Unreal packages, and leaves its artifacts for inspection.
A JSON report under `MeshyAssets/smoke/<run>/` records checks and failure details. A successful
run covers static OBJ import and transform/reimport only, not GLB, FBX, materials or animation.

For commandlet environments without actor factories, call `run(project, include_placement=False)`
for an explicitly **assets-only** check. The report sets `placement_tested: false`; it is not a
pass for placement or editor interaction. Full-editor null-RHI startup can itself fail on the
Preview; use a normal disposable editor for the placement run rather than weakening its assertions.

Complete these additional scenarios and record the actual results:

| Scenario | Expected observable result |
|---|---|
| Clean install; repeat install; update; removal | Existing startup code preserved, one managed block, correct version/hash, edits refused, files removable without deleting user code |
| Windows/macOS/Linux setup | Actual OS, engine build, agent/adapter versions, paths with spaces/non-ASCII names, tool discovery and project identity recorded |
| GLB with textures; FBX character and clip | Correct materials/scale, returned paths, matching skeleton, visible deformation; use retained fixtures, no generation required |
| Reimport with custom material/Blueprint references | Expected instances update; personal overrides are checked, prior source can restore the accepted result |
| Blank level; multiple PlayerStarts | Import-only/transform works without a start; ambiguous start requires a path |
| Slope, doorway, shelf, wall light, held prop | Intended transforms/contact/collision; heuristics do not remove valid intersections or attachments |
| Save/reopen/reconnect | Save scratch assets/level, user closes/reopens project, installed tools reload and recorded content persists |
| Interrupted create/wait/import | Same operation/task resumes or reconciles; no duplicate submission/actor; partially imported assets are inspected |
| Third Person player, if claiming support | Inspect template paths, retarget root, idle/run/turn/requested actions and capsule alignment; no unknown travel checks passed |
| Chosen jam target | Cook/package and launch a tiny scene containing the imported assets on the actual target; check materials, collision and performance |

Capture date, OS/hardware, engine build, agent/adapter, CLI/toolset versions, fixture hashes,
checks, failures and report paths in the release evidence. The compatibility matrix below
remains pending until these engine/host runs are performed. Keep preview limitations scoped to
those versions instead of promoting one session's workaround to a universal rule.

## Recorded engine evidence (2026-11-10)

On macOS arm64, Unreal 5.9.0-60351404, MeshyTools v5 passed the assets-only Python commandlet
run: local OBJ import, reimport to the same mesh path and changed bounds. No Meshy API calls
were made. This did not test GLB materials, FBX/animation, placement, save/reopen or packaging.
A commandlet placement attempt could not spawn an actor; a full-editor null-RHI attempt failed
during engine startup before the script ran. Those are recorded limitations, not passing tests.
A subsequent normal-Metal editor run passed OBJ import, explicit transform placement and reimport,
including preservation of the placed actor's mesh reference. That run found and verified the fix
for reflected `unreal.Array` transform arguments failing JSON response serialization after spawn.
It still does not cover textured GLB, character animation, attachment, save/reopen or packaging.
These observations come from development of the source skill; raw run reports are not bundled here.

## Compatibility and evidence (2026-11-11)

This matrix distinguishes historical observations in the original skill from release verification.
No row is a certification of all agents or hardware. Record build, OS, agent, toolset version,
scenario, result and date when running the smoke tests above.

| Combination | Evidence/status |
|---|---|
| macOS arm64, UE 5.9.0 build 60351404, v5, Python commandlet | 2026-11-10: local OBJ import and reimport passed; same mesh path and changed bounds verified. Assets-only, no placement/rendering/save certification. |
| macOS arm64, UE 5.9.0 build 60351404, v5, normal Metal editor | 2026-11-10: OBJ import, explicit transform placement and reimport passed; actor reference preserved. Save/reopen, textured GLB and animation pending. |
| macOS arm64, UE 5.9.0 build 60351404, v5, Claude Code (Opus 5.5) with the prompt-writing skills installed, paid | 2026-11-11, fresh Third Person project, one unattended run each: a stylized chest (concept image → Smart Topology Image-to-3D → Resize, 25 credits, 294 s) installed v5, imported a textured GLB with PBR maps and placed it level on the floor; a knight as the player (A-pose image → T2.5 → rig, 29 credits, 281 s) imported the rigged FBX, retargeted `ABP_Unarmed` (20 clips, every `travel_ok` true) and moved 11.7 m in 2 s in PIE with a visible jog. Both loaded `meshy-image-prompt`. Not checked: save/reopen, jump, slopes, foot sliding. The template's foot-placement Control Rig warned about the `Head` bone. |
| macOS arm64, UE 5.9.0, Rigging `skeleton_template: "ue5_mannequin"` with `include_fingers` | 2026-11-11, same knight model: the rig succeeded (5 credits, 21 s, 66 bones with mannequin names). Imported onto the template's `SK_Mannequin`, Interchange reported "cannot merge bone tree" and `ABP_Unarmed` did not run. Imported with `import_character`, the skeleton's bones below the pelvis kept metre-sized offsets (`spine_01` 0.11 cm): the mesh looked right at rest, and after `retarget_animations` every bone collapsed onto the pelvis in PIE. Use the default `meshyrig`. |
| UE 5.9.0 Preview, original MeshyTools v4 import/reimport/placement | Prior skill records successful sessions; exact OS/agent was not consistently captured. Re-run for v5 before release. |
| UE 5.8.2, original v4 imports/reimports | Prior skill records success. v5 regression pass pending; first install requires restart. |
| macOS 5.9 Preview, Assistant-panel external agent | Prior session performed work but panel then failed to display replies. Session-specific observation; re-test the actual build/adapter. |
| macOS 5.9 Preview, Meshy MCP client setup | Prior optional launcher path was exercised. v5 end-to-end pass pending. |
| Windows terminal/IDE + 5.9 Preview | Setup instructions provided; clean-machine and engine smoke verification pending. |
| Linux + 5.9 Preview | Setup route provided; engine smoke verification pending. |
| Desktop/mobile/web packaged result | Validate the chosen target; an editor screenshot does not certify packaging or runtime. |
| UEFN | Outside this skill's tested workflow; do not infer support from MegaJam accepting UEFN. |

Use capability discovery when the preview changes. If the configured route fails, report the
specific missing capability and preserve downloaded files/records; use a local agent or a
manual import handoff if appropriate. Do not repeatedly reinstall or regenerate to fix setup.
