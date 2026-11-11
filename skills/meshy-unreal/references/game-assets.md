# Assets matched to the project

Contents: inputs · platform budgets · generation · materials/scale · character integration.

## Start with what exists

Inspect a supplied image, local file, Meshy task, selected Unreal actor or project asset before
creating anything. Choose the shortest route in [pipelines](pipelines.md). Import-only and local
material/transform changes need no Meshy login. For a new object with no usable image,
recommend a concept image first and name Text-to-3D as the quicker alternative (*Start from an
image* in [pipelines](pipelines.md)); a blockout or quick draft can go straight to Text-to-3D.
Don't replace a supplied usable concept with a new paid image. Use [asset records](asset-list.md)
before any paid stage.

Write prompts with the installed prompt skills (*Write prompts with the prompt skills* in the
skill's main file); the templates below are the fallback when they are not installed.
Descriptions should preserve the user's design. Add object purpose, recognizable shapes,
materials and the project's style when helpful. Explain limitations without silently changing
the design: lettering may need a separate decal; emissive appearance needs an Unreal material;
thin parts may need thicker geometry. For exact shape/counts, consider a reference image or
separate components. A single generated building is not automatically an enterable modular kit.

Humanoid auto-rigging requires suitable anatomy and a clear pose. Animals, vehicles and creatures
can still be generated; animated nonhumanoids need a separate rigging workflow. Don't promise a
working vehicle or animated quadruped from the humanoid route. Held props should generally be
separate meshes attached to an inspected socket/bone. Clothing and fused hands can affect rigging;
review the actual input rather than forbidding whole clothing categories.

## Choose budgets from the use and target

Ask/infer the target before selecting expensive detail. These are **starting estimates**, not
compatibility guarantees or fixed generation limits. Honor an explicit budget and check the
actual result. Consider screen size, instance count, animation, transparency and target hardware.

| Target/use | Starting choice | Validate |
|---|---|---|
| Web/mobile/low-spec, small repeated prop | Smart Topology, roughly 1k–5k triangles; use a supported 2K generation texture then reduce imported texture resolution if appropriate | Build size, texture memory, renderer support, frame time on the target |
| Desktop interactive prop | Smart Topology, roughly 5k–20k triangles, 2K or lower imported textures | Collision, material slots, scale and actual screen coverage |
| Desktop humanoid | Smart Topology within the model's supported range, often 10k–30k for the main character; lower for distant/repeated NPCs | Deformation, skeleton, capsule alignment, animation and runtime cost |
| Close-up static hero/set piece | Dense mesh/4K PBR only when visible detail and target renderer justify it | Actual polygon count, Nanite support/settings, fallback mesh, memory and collision |
| Blockout/prototype | Reuse a placeholder or generate mesh-only at a modest budget | Silhouette, scale and gameplay fit before paying for polish |

Nanite and a collision hull are not guaranteed by import: settings come from the project's
Interchange pipeline. Inspect them. A single convex hull can close a doorway or bridge opening;
use collision appropriate to the gameplay and test it. Repeated actors share their mesh asset,
so duplication does not duplicate all source geometry on disk, but rendering/collision and draw
cost still need checking. Prefer instances for large repeated sets when the project supports it.
Do not assume enabling Nanite makes a dense asset suitable for every platform.

For image-based game assets, T2.5 + N1 (characters) and T2 + N1 (many props) are useful choices.
N1 supplies base color only; choose Meshy 7 texturing when PBR maps are needed. Don't pass
`--enable-pbr true` with N1. Consult the [model guide](https://docs.meshy.ai/en/api/models) and
[pipelines](pipelines.md) for supported combinations and current parameter limits.

## Generation examples

These templates spend credits only after authorization. Resolve `WORKSPACE` to the project and
`JOB_DIR` to its new revision directory. Operation placeholders come from the ledger; never
substitute a reusable asset name. Each create/wait is a separate step; record IDs before waiting.
Cost sources and previews: [delivery](delivery.md). Download all required textures/resources,
not just a mesh file that references missing sidecars.

### Text to a prop

For Smart Topology, price preview and refine from the current price list. A mesh-only draft
stops after preview. Set `TRIANGLES` to the chosen target. `meshy-text-to-3d-prompt` writes
`EXACT_PROMPT` and `meshy-texture-prompt` writes `TEXTURE_PROMPT` when installed; without a
texture prompt, drop `--texture-prompt`:

```bash
meshy text-to-3d create --mode preview --prompt "EXACT_PROMPT" --model-type smart-topology --target-polycount TRIANGLES --target-formats glb --operation-id "PREVIEW_OPERATION_ID" --async --format json --no-update-check
meshy text-to-3d wait PREVIEW_ID --timeout 600 --format json --no-update-check
meshy text-to-3d create --mode refine --preview-task-id PREVIEW_ID --texture-prompt "TEXTURE_PROMPT" --enable-pbr true --texture-resolution 2k --target-formats glb --operation-id "REFINE_OPERATION_ID" --async --format json --no-update-check
meshy text-to-3d wait REFINE_ID --timeout 600 -o "JOB_DIR/refine/NAME.glb" --workspace "WORKSPACE" --format json --no-update-check
```

For a justified dense hero asset, omit Smart Topology/target flags and select the required texture
resolution. Quote that matching standard route with the planner before creating:

```bash
meshy make "EXACT_PROMPT" --dry-run --format json --no-update-check
```

The planner estimate is for its matching route only; don't reuse it for a different model or
additional resize/rig stages. Inspect the generation thumbnail, not an assumed postprocess preview.

### Supplied image to an asset or humanoid

Use the supplied local image directly. For a riggable humanoid, inspect the pose and append
`--pose-mode a-pose` when appropriate; an unsuitable reference needs an explicitly agreed
preparation step. This example uses base-color texturing:

```bash
meshy image-to-3d create --image-url "IMAGE_PATH" --model-type smart-topology --ai-model meshy-t2.5 --target-polycount TRIANGLES --texture-model meshy-n1 --target-formats glb --operation-id "MODEL_OPERATION_ID" --async --format json --no-update-check
meshy image-to-3d wait MODEL_ID --timeout 600 -o "JOB_DIR/model/NAME.glb" --workspace "WORKSPACE" --format json --no-update-check
```

For many props use T2 when its shape/detail tradeoff fits. For PBR, replace N1 with Meshy 7 and
add supported PBR/resolution flags. Freeze the actual choice in the stage request.

Only if a new character concept is needed and authorized. With `meshy-image-prompt` installed,
take the prompt and image settings from its rig-ready character section; otherwise use this
template:

```bash
meshy text-to-image create --ai-model gpt-image-2-5-flare --pose-mode a-pose --aspect-ratio 3:4 --prompt "CHARACTER_DESCRIPTION, full body, front view, centered with space around it, soft even lighting, plain background, single character, empty hands" --operation-id "IMAGE_OPERATION_ID" --async --format json --no-update-check
meshy text-to-image wait IMAGE_ID --timeout 600 --format json --no-update-check
```

Download/show the image and check head-to-feet framing, separated arms and clear anatomy before
3D generation. Use its single-image task ID with `--input-task-id IMAGE_ID` instead of
`--image-url`; don't pay for a second image when an accepted one exists.

### Rig only when needed

A static character needs no rig. For a suitable humanoid that must move:

```bash
meshy rigging create --input-task-id MODEL_ID --height-meters HEIGHT_M --operation-id "RIG_OPERATION_ID" --async --format json --no-update-check
meshy rigging wait RIG_ID --timeout 600 -o "JOB_DIR/rig/" --all-assets --workspace "WORKSPACE" --format json --no-update-check
```

Leave `skeleton_template` at its default, `meshyrig`. Rigging also offers an Unreal mannequin
skeleton (`ue5_mannequin`), but on UE 5.9 its FBX imported with bones below the pelvis 100 times
too short: the character looked right at rest and collapsed to a point once animated, and it
cannot share the template's `SK_Mannequin` skeleton ([validation](validation.md), 2026-11-11).

Inspect the returned asset listing. Import `rigged_character.fbx` with `import_character`, then
walking/running FBX clips with `import_animation` on its returned skeleton. FBX is the characterized
Unreal path; do not assume any rigged GLB has correct scale without measuring. Use existing clips
or template retargeting when suitable; additional library/generated motion is in [animation](animation.md).
For the specific Third Person player swap read [character integration](character-player.md).

## Scale, pivot and revisions

Measure the imported mesh. If the user wants an actor larger, a local scale change is usually
sufficient and costs no credits. Use a parent/relative transform or appropriate pivot tooling
when the placement needs it. Use Meshy Resize only when a baked source size/origin is useful,
for example reusable exported assets or a requested source-file edit. Characters use rig height.

```bash
meshy resize create --input-task-id SOURCE_ID --resize-height HEIGHT_M --origin-at bottom --operation-id "RESIZE_OPERATION_ID" --async --format json --no-update-check
meshy resize wait RESIZE_ID --timeout 600 -o "JOB_DIR/resize/NAME.glb" --workspace "WORKSPACE" --format json --no-update-check
```

`bottom` is useful for floor-standing assets; choose a pivot suited to a wall, hinge, hand or
floating object instead. Long objects may use `--resize-longest-side`. A later dimension change
gets a new revision/operation ID, reusing the accepted source task. Preserve the prior source and
follow [reimport](meshy-toolset.md), then inspect every affected instance.

## Materials and texture tiles

Reuse existing materials/textures when the requested change is a tint, emissive parameter or
UV tiling adjustment. Avoid changing a shared material globally when only one actor should
change; use an instance/override appropriate to that actor. A generated image is not a complete
PBR material, and a tileable prompt does not prove seamless borders.

If a new surface image is requested:

```bash
meshy text-to-image create --ai-model gpt-image-2-5-flare --aspect-ratio 1:1 --prompt "Seamless tileable top-down texture of SURFACE, flat even lighting, no shadows, no perspective, fills the whole frame" --operation-id "TILE_OPERATION_ID" --async --format json --no-update-check
meshy text-to-image wait IMAGE_ID --timeout 600 --format json --no-update-check
```

Download into `JOB_DIR`, inspect a repeated 2×2 arrangement for seams, import using the discovered
TextureToolset, and build/apply the requested material through the material tools. Verify its
scale on the actual surface. Additional PBR maps are a separate need, not implied by this image.

## Cost examples

Estimates checked against [Meshy pricing](https://docs.meshy.ai/en/api/pricing) on 2026-11-10:
standard preview/refine 20+10; Smart Topology preview/refine 5+10; image-to-Smart-Topology with 2K
texture 15; GPT image 9; rig 5; Resize 1; library animation 3 credits per action. Recheck before
quoting; add only requested stages and report actual `consumed_credits` when returned. A supplied
character image can omit the image fee, a static character can omit the rig, and local sizing
can omit Resize. Reuse and duplication cost no Meshy credits but still have game runtime costs.
