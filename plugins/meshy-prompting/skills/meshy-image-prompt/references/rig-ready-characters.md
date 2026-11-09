# Rig-ready characters

A rig-ready character takes three API calls: an A-pose image, one Image to 3D task that makes and textures the mesh, and Rigging. Rigging needs a textured humanoid model of at most 380,000 triangles (a quad counts as two); a model with more returns `400`. A standard Image to 3D mesh comes out at 600,000 to 1.4 million faces, so it has to be remeshed, at generation with `should_remesh` or afterwards with the Remesh API to 300,000 or less. A Smart Topology mesh is generated at the face count you set and needs no remesh, which is why it is the recommended route.

## The recommended pipeline (29 credits, tested 2026-11-08)

| Step | Request | Credits | Tested result |
|---|---|---|---|
| 1. Text to Image | `{"ai_model":"gpt-image-2-5-flare","pose_mode":"a-pose","aspect_ratio":"3:4","prompt":"<formula prompt, no pose words>"}` | 9 | Clean A-pose at 3:4, hands clear of the body, 20 s |
| 2. Image to 3D | `{"input_task_id":"<step 1 task>","model_type":"smart-topology","ai_model":"meshy-t2.5","target_polycount":30000,"texture_model":"meshy-7","enable_pbr":true,"texture_resolution":"2k","pose_mode":"a-pose"}` | 15 | 31,472 triangles in 20 parts, no non-manifold edges; base color, metallic, roughness and normal maps at 2K; 8.3 MB GLB; 55 s |
| 3. Rigging | `{"input_task_id":"<step 2 task>","height_meters":1.8}` | 5 | 24 bones; walking and running clips included and both play cleanly, hands and forearms follow the arms, no limb fused to the torso; 14 s |

`image_url` replaces `input_task_id` on step 2 when the image did not come from a Meshy task. `height_meters` defaults to 1.7, and the rigged character comes out at that height.

Choosing `target_polycount`: `meshy-t2.5` takes 100 to 30,000 (default 15,000). 5,000 suits crowds and mobile, 20,000 a side character, 30,000 a lead character. In testing every Smart Topology count landed within 2.5% of its target. `meshy-t2` (100 to 15,000, default 4,000) is faster and keeps parts separate; both make triangles only, and `should_remesh` is ignored.

`nano-banana-pro` (Pro plan or above) also works for step 1 at the same 9 credits. On the nano-banana models `pose_mode` returns a 3:4 image whatever `aspect_ratio` says; the GPT Image models keep your `aspect_ratio`, so send `"3:4"`.

## The same image through three Image to 3D settings

On 2026-11-08 one A-pose image (a stocky dwarf blacksmith from `gpt-image-2-5-flare`) went through three Image to 3D settings, and all three models were rigged with `height_meters: 1.8`. One sample per arm. Mesh statistics come from the GLB files; the rigs were judged from rendered frames of the walking and running clips.

| Arm | Image to 3D settings | Credits (image + model + rig) | Model time | Triangles | Non-manifold edges | Textures | GLB | Rig |
|---|---|---|---|---|---|---|---|---|
| Smart Topology + Meshy 7 PBR (recommended) | `smart-topology`, `meshy-t2.5`, 30,000, `texture_model: meshy-7`, `enable_pbr`, 2K, `pose_mode: a-pose` | 9 + 15 + 5 = 29 | 55 s | 31,472 | 0 | base, metallic, roughness, normal | 8.3 MB | 24 bones, clean walk and run |
| Smart Topology + Meshy N1 | Same with `texture_model: meshy-n1` | 29 | 96 s | 31,491 | 8 | base color only | 4.7 MB | 24 bones, clean walk and run |
| Standard + remesh (the earlier route) | `ai_model: latest` (Meshy 7.1), `should_remesh`, 30,000, `enable_pbr`, 2K, `pose_mode: a-pose` | 9 + 30 + 5 = 44 | 127 s | 31,093 | 29 | base, metallic, roughness, normal | 12 MB | 24 bones, clean walk and run |

All three rigged and animated cleanly, so the choice comes down to cost, time and mesh quality. Smart Topology with Meshy 7 is half the model price, less than half the time, has no non-manifold edges and gives the smaller file. Meshy N1 suits an unlit or toon-shaded look: it paints from the image only, takes no `texture_prompt`, makes no PBR maps, and `enable_pbr: true`, `4k` or `8k` with it return `400`. The standard route is still there for a character that needs Meshy 7.1's denser surface detail.

Only the 30,000-face setting was rigged. Lower counts (5,000 for crowds, 20,000 for a side character) follow the same calls, but their rigs were not tested.

## What the rig files contain

- The armature carries a 0.01 scale, with the mesh in centimetres under a metre-scale armature. Check the imported height against your engine's reference character.
- Walking and running come as GLB and FBX with skin, plus armature-only GLBs.
- The rigged mesh stands at `height_meters`. Static Image to 3D models come back about 1 m on the longest side with the origin at the centre of the bounding box; Resize with `resize_height` (or `resize_longest_side`) and `origin_at: "bottom"` (1 credit, 2 s) sets the real size and a base pivot and keeps the PBR maps.

## Other routes

- **The standard route (44 credits):** Text to Image (9), Image to 3D on `latest` with `should_texture: true`, `should_remesh: true`, `target_polycount: 30000` and `enable_pbr: true` (30), Rigging (5). Tested on 2026-10-07 with `nano-banana-pro` (30,912 faces, standard A-pose, 24 joints, no forearm or hand weighted to the torso) and again on 2026-11-08 as the third arm above.
- **The longer route (49 credits):** mesh-only Image to 3D (20), Remesh to 30,000 faces (5), Retexture with the source image as `image_style_url` (10), then Rigging (5), plus the image (9). This is how the first rig test was run; Rigging accepts a Retexture task id.
- **Text to 3D** can also remesh at generation (`should_remesh: true` on the preview gave 31,105 faces, kept through refine, rigged directly), but its `pose_mode` result is an arms-out, palms-up pose whose hands face unnaturally in the walk animation, so it is not usable for animated characters.
- **Quadrupeds do not rig.** The Rigging docs say Rigging works only with humanoid (bipedal) characters. Plan animals, creatures and vehicles as static models or animate them by hand.

## Rig measurements (standard route, 2026-10-07)

Angles measured from the joint positions in each rigged GLB, about 20,000 vertices each after remesh, 24 joints.

| Rig | Upper arm below horizontal | Elbow bend | Forearm or hand vertices weighted to torso | Vertices shared by arm and torso | Vertices weighted to both legs |
|---|---|---|---|---|---|
| Image route A, `pose_mode` image | 55 to 56° | 23 to 24° | 0 | 2.5% | 10.5% |
| Image route B, A-pose words in the image prompt | 52 to 53° | 28 to 29° | 0 | 1.0% | 7.3% |
| Image route C, both | 53 to 55° | 19 to 23° | 0 | 2.0% | 12.6% |
| One-task route (textured Image to 3D with remesh) | 56° | 26° | 0 | clean | — |
| Text to 3D with `pose_mode` (for comparison) | 46 to 47° | 75° | 0 | 0.37% | — |

No image-route rig has a forearm or hand fused to the body, which is the usual failure when arms touch the body in the source image. Some overlap at the shoulders is normal. The leg overlap comes from the long apron: a long apron or skirt is weighted to both legs and stretches when the legs separate, so ask for clothing that ends above the knee or splits between the legs.

## Not yet tested

T-pose through this pipeline; characters with capes or held props; Smart Topology below 30,000 faces through Rigging; `texture_prompt` on step 2 with Meshy 7 (the tests textured from the image alone).
