# Asset planning, revisions and provenance

Contents: plan · durable records · operation lifecycle · revision/download rules · teamwork · legacy records.

## Plan from the game and existing work

For a theme or asset-list request, inspect the game loop and existing assets. Propose only the
assets needed for that scope, with intended use, source, placement, platform budget and cost.
Use the existing style or offer a few directions when it is undecided. A shared style is a
planning default; changing it never changes the historical prompt for an asset already made.
Reuse meshes/materials and local edits before proposing new paid variants. One authorization
can cover the whole quoted batch; retain its scope and remaining credit budget across sessions.

## Durable records

Use the ledger for paid operations, replacing a source asset and team handoffs. A small local
transform or material edit can go straight from inspection to edit, verification and save
reporting. If it already has a record, respect its current owner and optionally append a
local milestone; do not create a full specification just to move an actor.

Use the standard-library [ledger helper](../scripts/asset_ledger.py). It stores one JSON record
per revision in `WORKSPACE/MeshyAssets/records/`, with a local writer lock and atomic writes.
JSON keeps it usable in Unreal's embedded Python without installing PyYAML. Each record has an
immutable specification, UTC creation time, owner, parent revision, unique operation IDs, and
append-only events. Do not hand-edit a submitted specification or replace its history.

Create a specification JSON file under `MeshyAssets/` like this (replace example values):

```json
{
  "intent": "Create a wall-mounted light from the supplied concept",
  "prompt": "Exact submitted description including the style clause at this time",
  "inputs": [{"path": "MeshyAssets/references/light.png", "sha256": "ACTUAL_FILE_HASH", "source": "user-supplied concept"}],
  "settings": {"model_type": "smart-topology", "ai_model": "meshy-t2.5", "texture_model": "meshy-n1", "target_polycount": 5000},
  "target": {"platform": "desktop", "use": "decoration"},
  "placement": {"mode": "surface", "destination": "/Game/Environment/Lights"},
  "approved_credits": 15,
  "authorization": "User approved this asset at the quoted estimate; no reruns included",
  "stages": {"model": "image-to-3d"}
}
```

`approved_credits` is null for an unapproved plan, zero for entirely local work, or the actual
approved allowance. `stages` lists only paid creates for this revision; use `{}` for a local
import/edit. Inputs use local paths, content hashes and/or task IDs, not signed URLs or
credentials. Record the actual source date when known; don't guess it from import time.

Invoke the helper with the host's Python and these arguments:

- `--project PROJECT new --name light --owner SESSION_ID --spec SPEC_JSON`
- `--project PROJECT show --revision REVISION_ID`
- `--project PROJECT record --revision REVISION_ID --owner SESSION_ID --event EVENT_JSON`
- `--project PROJECT handoff --revision REVISION_ID --owner SESSION_ID --to NEXT_SESSION_ID`

Quote each path argument. `PROJECT` is the `.uproject` file or project folder. The returned
revision UUID is the output directory name. The helper's functions can also be called with
`runpy.run_path("ABSOLUTE_SKILL_PATH/scripts/asset_ledger.py")` through Unreal's Python tool:
`new_revision(project, name, owner, spec, previous=None)`,
`record_event(project, revision, owner, event)` and `handoff(project, revision, owner, next_owner)`.
No helper submits tasks or spends credits.

## Before and after each stage

1. Read the record. Do not start a stage already submitted or completed. Reconcile unknown
   submissions using the CLI operations journal as [troubleshooting](troubleshooting.md) explains.
2. Resolve the exact request, including actual upstream task IDs, and record an event before the
   call: `{"state":"generating","stage":"model","stage_state":"submitted","request":{...}}`.
   Use that stage's UUID from `operations.model.operation_id` as `--operation-id`.
   A crash at this point is an uncertain submission; inspect the journal before sending again.
3. Immediately record the returned `task_id` on the same stage. Keep the same request and ID for
   retries. A success event uses `stage_state: "succeeded"`, the task ID, and `consumed_credits`
   if supplied. Failed/unknown/canceled results use their actual stage state; never call failure
   a success to advance the workflow.
4. Record local milestones with `state`, `files`, `assets`, `actors` and `evidence`. States are
   planned, approved, generating, downloaded, imported, placed, validated, save_pending, saved,
   failed, interrupted and canceled. They describe observed progress, not compulsory stages:
   import-only has no placed stage. `saved` requires evidence such as user confirmation or a
   verified save/reopen result. An editor crash requires checking persisted assets again.

A changed prompt, changed resize dimensions, a rerun or a new paid stage is an intentional new
revision: `new ... --previous PREVIOUS_REVISION_ID`. Record the applicable authorization, reuse
valid upstream task IDs, and create **new** operation IDs for new requests. Never use a short
name like `crate-resize` globally: the CLI operation journal is shared across projects by default.
Approved plans remain immutable too: create an approved child revision instead of changing the
record that was originally proposed. Record rejected/abandoned variants without overwriting them.

## Files and reimport

Use `MeshyAssets/<asset>/<revision>/<stage>/` for sources and previews: for example
`refine/crate.glb`, then `resize/crate.glb`. Different tasks must not download to the same file,
even within one revision: the CLI refuses that overwrite. Keep earlier stage files. Follow [the staging and reimport procedure](meshy-toolset.md)
for replacing Unreal content while keeping the old working source. If the server's task assets
expire, chain from retained local files where supported rather than regenerating the model.

## Teams and interrupted sessions

Assign an owner before a team member or agent submits an asset. The helper refuses another
owner's updates and an accidental second first revision for the same asset name. Only the
current revision can be updated, handed off or used as the parent of a new revision; old
revisions stay readable. Reconcile submitted/unknown operations before advancing. Explicitly
handoff the current revision before another writer continues. A branched or incomplete history
from a merge is refused until the team reconciles it; the helper never guesses the owner. A dead local `.lock` is inspected and removed only
once the previous writer is known to have stopped; elapsed time alone is not proof.

The lock protects a **single local checkout**, not multiple computers or Git branches. Before
team work, reserve asset names and responsibility in the team's shared plan. Commit/pull records
at handoff, resolve competing revisions, and don't submit from both copies. Per-revision files
reduce merge conflicts but do not provide distributed billing/idempotency guarantees.

When exporting provenance, read each stage's frozen request plus its immutable specification,
input lineage and actual timestamps; never rebuild old prompts from today's style setting.
Use [MegaJam guidance](megajam.md) to separate submission requirements from optional records.

## Existing assets.yaml

If `MeshyAssets/assets.yaml` exists, read it before any new submission. Keep it as a legacy
record. Adopt existing task IDs and local sources into a new record with `stages: {}` and an
input pointing to the legacy entry; record the observed status without resubmitting. Retain the
original made date as source metadata. Historical prompts/settings not stored in the old file
are unknown; do not reconstruct them as facts. Only a genuinely new paid operation gets a new
stage. Once adopted, use the new record as the authoritative owner/status for that asset.
