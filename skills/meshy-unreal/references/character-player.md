# Optional: a humanoid as the Third Person template player

This is a characterized example, not a default for every character. Inspect the actual game
mode, player Blueprint, skeletal mesh and animation Blueprint first. The paths below must
exist and match the active template. For custom controllers, first-person games, creatures,
vehicles or nonstandard rigs, adapt from discovered project assets or stop at a usable mesh;
do not replace a template the game does not use. Preserve original assignments for rollback.
Record the selected assets and save checkpoints in the revision ledger.


This uses local editor operations and costs no Meshy credits. A user request to make this the
player authorizes the swap; an asset-generation request alone does not. Confirm that integration
scope only when it has not already been specified.

1. **Copy the template's animations.** One call: `retarget_animations` with `animation_paths`
   `["/Game/Characters/Mannequins/Anims/Unarmed/ABP_Unarmed"]`, `include_referenced` true, the
   character as `target_mesh_path`, and `folder_path` `/Game/Meshy/NAME_IN_PASCAL_CASE/Retargeted`.
   It copies the animation blueprint and referenced blend spaces/clips. One prior template test
   produced 20 clips; inspect the actual returned assets rather than depending on that count.
   Require `root_motion.set` and every clip's `travel_ok` to be true; unknown is unverified. The blueprint's copy is named in `also_created`.
2. **Point the player Blueprint at them.** On Unreal Engine 5.9, with `execute_python`:

   ```python
   import unreal
   abp = unreal.load_asset("ABP_COPY_PATH")
   unreal.BlueprintEditorLibrary.compile_blueprint(abp)
   abp_class = unreal.load_object(None, "ABP_COPY_PATH.ABP_COPY_NAME_C")
   bp = unreal.load_asset("/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter")
   mesh = unreal.get_default_object(bp.generated_class()).get_editor_property("mesh")
   with unreal.ScopedEditorTransaction("Meshy: character as player"):
       bp.modify(); mesh.modify()
       mesh.set_skeletal_mesh_asset(unreal.load_asset("CHARACTER_MESH_PATH"))
       mesh.set_editor_property("anim_class", abp_class)
   unreal.BlueprintEditorLibrary.compile_blueprint(bp)
   ```

   On 5.8 there is no Python tool: tell the user to open `BP_ThirdPersonCharacter`, select its
   Mesh component, and set **Skeletal Mesh Asset** and **Anim Class** to the same two assets.
   Setting those two back undoes the swap.
3. **Check it in play.** `EditorAppToolset.StartPIE`; `InputToolset.InputToolset.ApplyInput` with
   one entry, `key` `{keyName: "W"}` and `value` `{x: 1, y: 0, z: 0}`, for 2 seconds; then read
   the player pawn's location with `execute_python` (it should have moved several metres) and
   take `CaptureGameViewport`; then `StopPIE`. Use the project's actual input bindings. Also check idle, turning, the requested actions,
   capsule alignment and obvious foot sliding; test slopes/jumps only when relevant. A two-second
   forward movement is a smoke test, not proof of gameplay readiness. Stop PIE even if a check fails.

Inspect and report actual warnings. In the earlier tested template, foot placement expected
mannequin bones and produced a warning; feet did not fully adapt to slopes and finger motion
was limited. A previously placed decorative actor is not automatically removed by a player swap.

Deleting/renaming a Blueprint through Python crashed one earlier 5.9 Preview test. For this
recipe use manual Content Browser cleanup until that operation has been verified on the actual
build. Do not delete existing Blueprint assets as a recovery shortcut.


Save the accepted mesh/animation/Blueprint changes and level at a checkpoint; report any remaining
warning and save state. Follow [validation](validation.md). A decorative looping character is not
an AI-controlled NPC; behavior, navigation and multiplayer integration are separate requested work.
