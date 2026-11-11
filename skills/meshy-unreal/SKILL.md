---
name: meshy-unreal
description: "Create, adapt, import and place Meshy assets in Unreal Engine projects. Use when the user wants Unreal assets from text or image references, existing Meshy files/tasks, material and size changes, game asset lists, or humanoid animation through Unreal MCP. Targets Unreal Engine 5.9 Preview with a 5.8 compatibility path. Not for UEFN or prompt-writing-only requests."
license: MIT
metadata:
  author: meshy-dev
  version: "0.2.0"
---

# Meshy for Unreal

Targets Unreal Engine 5.9 Preview (5.8 compatibility) through Unreal MCP. Paid Meshy operations
need Node.js 22.12+, Meshy CLI 0.8.x from 0.8.5, and an eligible Meshy account. Local import and
placement need no login. Bundled helpers use Python 3.11+ with its standard library, including
Unreal's embedded Python.

Create, adapt and integrate assets using the project's existing style, constraints and workflow.
Completion means the requested result is verified and its save state is reported: an imported
asset, an intentionally placed or attached actor, a material change, or a working animation.
Creating a new model, placing it on the floor and rigging it are choices, not mandatory stages.

## Choose the smallest useful workflow

Inspect the request, current selection, project and existing asset records first. Infer what you
can; ask only for a missing decision that changes the outcome or cost. Establish the input,
intended use, target platform, style, approximate size and any budget. Preserve explicit choices.

| Request/input | Start here |
|---|---|
| Existing local GLB/FBX or Unreal asset | Inspect and import, place or edit it; no Meshy account or generation needed |
| Existing Meshy task | Retrieve its state/files and resume; don't generate a replacement |
| Supplied image or concept | Image-to-3D; preserve the reference instead of buying a new concept |
| New object from text | Recommend a concept image, then Image-to-3D from it; Text-to-3D for a quick draft or when the user picks it |
| Size, pivot, material, color, topology or format change | Edit in Unreal when that satisfies the request; otherwise process the existing source |
| Character that needs motion | Check rig suitability; rig only when needed, reuse existing animations where compatible |
| Theme or asset list | Plan around the game loop, reuse existing assets, quote a bounded batch |

Read [game assets](references/game-assets.md) for platform budgets, generation recipes, materials
and the optional Third Person character workflow. Detailed CLI routes are in
[pipelines](references/pipelines.md); rigging and motion are in [animation](references/animation.md).
UEFN is a separate editor workflow and is not certified by this skill's Unreal tests.

## Write prompts with the prompt skills

The Meshy prompt-writing skills hold the tested prompt formulas this skill's templates only
summarize. When one is installed beside this skill, load it before writing the prompt for a
paid stage:

| Stage | Skill |
|---|---|
| Concept or reference image: text-to-image, image-to-image, multi-view, A-pose character | `meshy-image-prompt` |
| Text-to-3D preview | `meshy-text-to-3d-prompt` |
| Texture on refine or Image-to-3D, or `--text-style-prompt` on retexture | `meshy-texture-prompt` |
| One part of an existing Meshy model changed in the web app's Edit tool (no CLI command) | `meshy-edit-prompt` |

They write prompts and settings and never call Meshy. Take the prompt text from them, and their
settings where neither the user nor this skill has set one. Models, budgets, the quote, the
ledger and Unreal paths stay as chosen here. Record the prompt exactly as submitted. When the
matching skill is not installed, use the templates in [game assets](references/game-assets.md)
and [pipelines](references/pipelines.md). Text-to-motion and tileable surface textures have no
prompt skill.

## Establish only the capabilities needed

Use the [quickstart](references/quickstart.md) and [validation evidence](references/validation.md). The recommended first
path is a local terminal/IDE agent connected to the open Unreal project. Verify the connected
editor's project and engine build, not just the shell's working directory or an assumed port.
Read [Unreal setup](references/unreal-setup.md) for connection problems or the optional Assistant
panel; [5.8 differences](references/unreal-5-8.md) apply only to a 5.8 project.

- For editor work, discover the needed tools and their argument schemas. Install the versioned
  [MeshyTools](references/meshy-toolset.md) only when its import/placement tools are needed.
- For Meshy API work, resolve the CLI and reuse the account through [setup](references/setup.md).
  Skip login and balance checks for entirely local work.
- For a client without filesystem/shell access, have a local agent or person bootstrap the
  files and optional Meshy MCP connection first; do not pretend it can run CLI recipes.

**Unreal path rules override the generic defaults in the shared references:** `WORKSPACE` is
the confirmed `.uproject` directory; `JOB_DIR` is `WORKSPACE/MeshyAssets/<asset>/<revision>/`.
Use the user's intended Content Browser destination. Keep durable sources, previews and the
revision ledger under `MeshyAssets/`; never substitute `./meshy_output` for this project root.

## Execute, inspect, integrate

1. **Plan only what is needed.** For a simple local material or transform edit, inspect the
   selection and affected instances, make the edit, verify it and report its save state; no
   new ledger specification is required. For paid work, source replacement or team handoff,
   follow [asset records](references/asset-list.md). Record exact inputs/settings and unique
   operation IDs before submission. Reuse an ID only for the same request's retry. The current
   asset revision has one writer; historical revisions cannot bypass its ownership.
2. **Quote only paid work.** Use the planner or current price list as
   [delivery](references/delivery.md) describes. Existing authorization covers the agreed batch
   and stages. Ask again only for a new cost outside it; local edits don't require a paid quote.
3. **Generate or reuse.** Save task IDs immediately, then wait on those IDs. Observe account
   concurrency limits for batches. On uncertain submission reconcile before retrying; on a
   failed, blocked or canceled stage record that state and continue independent authorized work.
   See [troubleshooting](references/troubleshooting.md).
4. **Inspect before downstream work.** Check the reference/concept and returned model preview
   as appropriate. Download into separate stage folders within the revision, preserving earlier results.
   A missing preview is reported, not repaired with another paid generation.
5. **Import or update deliberately.** MeshyTools reports the imported assets. Select the intended
   mesh if there are several. Before replacing a shared asset, identify affected actors and
   material/Blueprint overrides; preserve the previous sources and record the affected paths.
   Follow the explicit reimport procedure in [MeshyTools](references/meshy-toolset.md).
6. **Use the requested placement.** Choose import-only, ground, surface, attachment or full
   transform. Ground placement is a convenience for floor-standing objects. Surface and socket
   placement use discovered editor tools. Intentional intersections, terrain slopes and hanging
   objects are valid; bounding-box overlap reports are hints to inspect, not automatic failures.
7. **Verify for purpose.** Inspect from a useful camera; use base-color capture for texture
   questions and play mode for behavior. Check scale/materials for a prop, passable collision for
   a doorway, movement/animation for a player character, and target-platform suitability for
   performance-sensitive assets. Stop PIE after a test you started. Follow
   [validation](references/validation.md); report what was and wasn't checked.
8. **Checkpoint saves.** At an accepted asset or small batch, identify changed assets and levels.
   Use an already verified noninteractive save path when authorized. Otherwise ask the user to
   save those assets/levels, and keep `save_pending` until confirmed. Never equate placed with
   persisted. Do not invoke an untested save operation that may open a modal dialog.

## Project changes and handoff

Limit editor edits to the requested assets and integration. Preserve existing project files and
personal toolset edits; the installer refuses unmanaged replacements. Do not restart/exit the
editor or delete unrelated actors to resolve a tool failure. If a dialog blocks MCP, explain
which user action is needed and preserve the revision's recovery information.

Normal writes are under the project: `MeshyAssets/`, the managed files in `Content/Python/`,
agent configuration, explicitly needed plugin entries, and optionally `Skills/meshy-unreal/`.
An optional external MCP launcher is a separately explained user-level setup change. Keep
credentials out of the project and ledger; ignore `MeshyAssets/**/*meta.json` in Git because
those sidecars may contain signed URLs. Use the project's source-control conventions for binary
assets. Shared references govern CLI credentials; the editor's [setup](references/unreal-setup.md)
covers Epic's provider data requirements.

Hand over the result and preview, Content Browser/actor paths, source revision, actual credit
usage when available, checks performed, and **saved or save pending**. Mention concrete remaining
limitations. For jam work, read the dated [MegaJam reference](references/megajam.md) and export
provenance from the immutable submitted records. Keep full-game implementation and submission
outside the task unless requested.
