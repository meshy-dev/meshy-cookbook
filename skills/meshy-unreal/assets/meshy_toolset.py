# Meshy tools for Unreal MCP. Written into this project by the meshy-unreal agent skill.
# Registers the MeshyTools toolset: import Meshy GLB and FBX files through Interchange,
# import animation clips onto a skeleton, retarget mannequin animations, and place
# models at ground or explicit transforms. Every tool returns JSON text.
# Install/update/remove with the bundled installer; preserve managed startup code and backups.
import json
import math
import os
import sys

import unreal
import toolset_registry
from toolset_registry.registration import Registration

MESHY_TOOLSET_VERSION = "5"
_PIPELINE_DIR = "/Game/Meshy/_Pipelines"
_MANNEQUIN = "/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple"
_eal = unreal.EditorAssetLibrary


def _path(obj):
    return obj.get_path_name().split(".")[0] if obj else ""


def _bounds(obj):
    b = obj.get_bounds()
    o, e = b.origin, b.box_extent
    return {
        "size_cm": [round(2 * e.x, 1), round(2 * e.y, 1), round(2 * e.z, 1)],
        "min_z_cm": round(o.z - e.z, 1),
        "center_cm": [round(o.x, 1), round(o.y, 1), round(o.z, 1)],
    }


def _source(source_file, extensions):
    path = os.path.abspath(os.path.expanduser(source_file))
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No file at {path}. Pass an absolute path.")
    ext = os.path.splitext(path)[1].lower()
    if ext not in extensions:
        raise ValueError(f"{ext} is not supported here; expected one of {sorted(extensions)}.")
    return path


def _folder(folder_path):
    folder = folder_path.rstrip("/")
    if not folder.startswith("/Game/"):
        raise ValueError("folder_path must start with /Game/, e.g. /Game/Meshy/Rocket")
    return folder


def _assets_in(folder):
    return [p.split(".")[0] for p in _eal.list_assets(folder, recursive=True, include_folder=False)]


def _import(path, folder, asset_name, replace=False):
    """Default Interchange import, as a drag into the Content Browser with the dialog's defaults."""
    before = set(_assets_in(folder)) if _eal.does_directory_exist(folder) else set()
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = folder
    if asset_name:
        task.destination_name = asset_name
    task.automated = True
    task.replace_existing = bool(replace)
    task.save = False
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    made = [p.split(".")[0] for p in task.get_editor_property("imported_object_paths")]
    new = sorted(set(made) | (set(_assets_in(folder)) - before))
    if not new:
        raise RuntimeError(f"Importing {path} produced no assets. If {folder} already holds an asset "
                           "with that name, pass replace_existing true to update it in place, or "
                           "pick a new asset_name or folder.")
    return new


def _world():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()


def _floor_z(x, y, from_z, ignore):
    start = unreal.Vector(x, y, from_z + 2000.0)
    end = unreal.Vector(x, y, from_z - 20000.0)
    hit = unreal.SystemLibrary.line_trace_single(
        _world(), start, end, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, False, ignore,
        unreal.DrawDebugTrace.NONE, True)
    if isinstance(hit, tuple):
        hit = hit[-1] if hit and not isinstance(hit[0], unreal.HitResult) else hit[0]
    if hit is None:
        return None, None
    t = hit.to_tuple()
    if not t[0]:
        return None, None
    return t[4].z, t[9]


def _ground(actor):
    """Traces a 3x3 grid under the actor's footprint: (highest hit z, lowest hit z, labels hit)."""
    origin, extent = actor.get_actor_bounds(False)
    zs, labels = [], []
    for fx in (-0.85, 0.0, 0.85):
        for fy in (-0.85, 0.0, 0.85):
            z, hit_actor = _floor_z(origin.x + fx * extent.x, origin.y + fy * extent.y, origin.z, [actor])
            if z is not None:
                zs.append(z)
                label = hit_actor.get_actor_label() if hit_actor else "?"
                if label not in labels:
                    labels.append(label)
    if not zs:
        return None, None, []
    return max(zs), min(zs), labels


def _spawn_on_floor(asset, x, y, yaw, floor_hint_z_cm=0.0):
    """Spawns the asset and sets its lowest point on the highest ground under its footprint."""
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor = actors.spawn_actor_from_object(asset, unreal.Vector(x, y, floor_hint_z_cm), unreal.Rotator(pitch=0, yaw=yaw, roll=0))
    if actor is None:
        raise RuntimeError(f"Could not spawn {_path(asset)}.")
    top, low, under = _ground(actor)
    if top is not None:
        origin, extent = actor.get_actor_bounds(False)
        loc = actor.get_actor_location()
        actor.set_actor_location(unreal.Vector(loc.x, loc.y, loc.z + top - (origin.z - extent.z)), False, False)
    return actor, (top, low), under


def _overlaps(actor, under):
    """Labels of other mesh actors whose bounding boxes cut into this one (what it stands on excluded)."""
    o, e = actor.get_actor_bounds(False)
    lo = (o.x - e.x, o.y - e.y, o.z - e.z + 2.0)
    hi = (o.x + e.x, o.y + e.y, o.z + e.z)
    hits = []
    for other in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
        if other == actor or other.get_actor_label() in under:
            continue
        if isinstance(other, (unreal.Volume, unreal.Light, unreal.PlayerStart)):
            continue
        if not other.get_components_by_class(unreal.PrimitiveComponent):
            continue
        oo, oe = other.get_actor_bounds(True)
        if oe.x <= 0 and oe.y <= 0 and oe.z <= 0:
            continue
        if max(oe.x, oe.y) > 5000:
            continue
        if all(oo_c - oe_c < h and oo_c + oe_c > l for oo_c, oe_c, l, h in
               ((oo.x, oe.x, lo[0], hi[0]), (oo.y, oe.y, lo[1], hi[1]), (oo.z, oe.z, lo[2], hi[2]))):
            hits.append(other.get_actor_label())
    return hits


def _actor_report(actor, floor, under):
    origin, extent = actor.get_actor_bounds(False)
    loc, rot = actor.get_actor_location(), actor.get_actor_rotation()
    return {
        "actor": actor.get_actor_label(),
        "actor_path": actor.get_path_name(),
        "location_cm": [round(loc.x, 1), round(loc.y, 1), round(loc.z, 1)],
        "yaw_deg": round(rot.yaw, 1),
        "size_cm": [round(2 * extent.x, 1), round(2 * extent.y, 1), round(2 * extent.z, 1)],
        "bottom_z_cm": round(origin.z - extent.z, 1),
        "stands_on": under,
        "level": floor[0] is not None and floor[0] - floor[1] <= 5.0,
        "ground_drop_cm": None if floor[0] is None else round(floor[0] - floor[1], 1),
        "overlaps": _overlaps(actor, under),
        "overlap_method": "axis_aligned_bounds_heuristic",
        "save_state": "save_pending",
    }


def _anim_pipeline(skeleton):
    name = _PIPELINE_DIR + "/MeshyAnimationsOnly"
    pipe = unreal.load_asset(name) if _eal.does_asset_exist(name) else _eal.duplicate_loaded_asset(
        unreal.load_asset("/Interchange/Pipelines/DefaultAssetsPipeline"), name)
    common = pipe.get_editor_property("common_skeletal_meshes_and_animations_properties")
    common.set_editor_property("skeleton", skeleton)
    common.set_editor_property("import_only_animations", True)
    return pipe


def _root_bone(rig):
    """The root bone of an IK Rig's skeleton: the one that carries a clip's travel."""
    ctl = unreal.IKRigController.get_controller(rig)
    try:
        bone = str(ctl.get_root_motion_bone())
        if bone and bone != "None":
            return bone
    except Exception:
        pass
    try:
        mesh, bone = ctl.get_skeletal_mesh(), str(ctl.get_retarget_root())
        for _ in range(64):
            parent = str(mesh.get_bone_parent(bone))
            if not parent or parent == "None":
                return bone
            bone = parent
    except Exception:
        pass
    return ""


def _set_root_motion_bones(rtg, src_rig, dst_rig):
    """Points the retargeter's Root Motion step at both root bones and the target's pelvis.
    Left unset, a clip's forward travel lands on the target's hips, and a character driven by
    the clip runs ahead of its collision capsule."""
    out = {"source_root": _root_bone(src_rig), "target_root": _root_bone(dst_rig),
           "target_pelvis": str(unreal.IKRigController.get_controller(dst_rig).get_retarget_root()),
           "set": False}
    try:
        rc = unreal.IKRetargeterController.get_controller(rtg)
        op = rc.get_op_controller(rc.get_index_of_op_by_name("Root Motion"))
        op.set_source_root_bone(out["source_root"])
        op.set_target_root_bone(out["target_root"])
        op.set_target_pelvis_bone(out["target_pelvis"])
        out["set"] = True
    except Exception as exc:
        out["error"] = str(exc)[:200]
    return out


def _bone_travel(anim, bone):
    """How far a bone moves from where it starts, relative to its parent, over a clip, in cm."""
    try:
        length, start, far = anim.get_play_length(), None, 0.0
        for i in range(9):
            p = unreal.AnimationLibrary.get_bone_pose_for_time(anim, bone, length * i / 8.0, False).translation
            if start is None:
                start = p
            far = max(far, math.sqrt((p.x - start.x) ** 2 + (p.y - start.y) ** 2 + (p.z - start.z) ** 2))
        return round(far, 1)
    except Exception:
        return None


@unreal.uclass()
class MeshyTools(unreal.ToolsetDefinition):
    """Meshy asset tools: import Meshy GLB and FBX files into the project with Unreal's
    Interchange defaults (the same result as dragging the file into the Content Browser),
    import animation clips onto an existing skeleton, retarget the mannequin's animations
    onto a Meshy character, and place models and characters standing on the floor.
    Nothing here saves; the user saves the level and assets."""

    @toolset_registry.tool_call
    @staticmethod
    def import_model(source_file: str, folder_path: str, asset_name: str,
                     replace_existing: bool = False) -> str:
        """Imports a GLB, glTF, FBX or OBJ file as a static mesh with Interchange's defaults:
        settings come from this project's Interchange pipeline. Inspect materials, scale,
        Nanite and collision after import; defaults vary by project and file type.

        Args:
            source_file: Absolute path to the model file on disk.
            folder_path: Content Browser folder to import into, e.g. /Game/Meshy/Rocket.
            asset_name: Name for the static mesh, e.g. rocket.
            replace_existing: True to update the assets an earlier import of this name made in
                this folder (a resized or retextured version of the same model). Actors
                already placed from them show the new version. False refuses to overwrite.

        Returns:
            JSON with the static mesh path, every asset created, its size in cm, the lowest
            point relative to its pivot and whether Nanite is on.
        """
        made = _import(_source(source_file, {".glb", ".gltf", ".fbx", ".obj"}), _folder(folder_path), asset_name,
                       replace_existing)
        out = {"assets": made, "replaced": bool(replace_existing), "save_state": "save_pending"}
        out["static_meshes"] = [p for p in made if isinstance(unreal.load_asset(p), unreal.StaticMesh)]
        out["selection_required"] = len(out["static_meshes"]) > 1
        for p in made:
            a = unreal.load_asset(p)
            if isinstance(a, unreal.StaticMesh):
                out["static_mesh"] = p
                out.update(_bounds(a))
                try:
                    out["nanite"] = a.get_editor_property("nanite_settings").enabled
                except Exception:
                    pass
                break
        if "static_mesh" not in out:
            raise RuntimeError(f"The import made no static mesh: {made}")
        return json.dumps(out)

    @toolset_registry.tool_call
    @staticmethod
    def import_character(source_file: str, folder_path: str, asset_name: str,
                         replace_existing: bool = False) -> str:
        """Imports a rigged Meshy character (rigged_character.fbx) as a skeletal mesh with its
        skeleton, physics asset, material and textures. Use the FBX, not the GLB: the GLB
        arrives 100 times too small with the default import.

        Args:
            source_file: Absolute path to the rigged FBX on disk.
            folder_path: Content Browser folder to import into, e.g. /Game/Meshy/Mechanic.
            asset_name: Name for the skeletal mesh, e.g. mechanic.
            replace_existing: True to update the character an earlier import of this name made
                in this folder. False refuses to overwrite.

        Returns:
            JSON with the skeletal mesh, skeleton and physics asset paths, every asset
            created, and the character's size in cm.
        """
        made = _import(_source(source_file, {".fbx"}), _folder(folder_path), asset_name, replace_existing)
        out = {"assets": made, "replaced": bool(replace_existing), "save_state": "save_pending"}
        for p in made:
            a = unreal.load_asset(p)
            if isinstance(a, unreal.SkeletalMesh):
                out["skeletal_mesh"] = p
                out["skeleton"] = _path(a.skeleton)
                out["physics_asset"] = _path(a.physics_asset)
                out.update(_bounds(a))
                break
        if "skeletal_mesh" not in out:
            raise RuntimeError(f"The import made no skeletal mesh: {made}")
        return json.dumps(out)

    @toolset_registry.tool_call
    @staticmethod
    def import_animation(source_file: str, folder_path: str, skeleton_path: str) -> str:
        """Imports only the animation from a Meshy clip file (walking_fbx.fbx, running_fbx.fbx,
        or an animate task's FBX) onto a skeleton that already exists, without a second mesh
        or skeleton. Same as Import Only Animations with Skeleton set in the import dialog.

        Args:
            source_file: Absolute path to the clip's FBX on disk.
            folder_path: Content Browser folder to import into.
            skeleton_path: The character's skeleton, e.g. /Game/Meshy/Mechanic/rigged_character_Skeleton.

        Returns:
            JSON with each new animation's path and length in seconds.
        """
        path = _source(source_file, {".fbx", ".glb", ".gltf"})
        folder = _folder(folder_path)
        skeleton = unreal.load_asset(skeleton_path)
        if not isinstance(skeleton, unreal.Skeleton):
            raise ValueError(f"{skeleton_path} is not a Skeleton asset.")
        before = set(_assets_in(folder)) if _eal.does_directory_exist(folder) else set()
        params = unreal.ImportAssetParameters()
        params.is_automated = True
        params.override_pipelines = [unreal.SoftObjectPath(_anim_pipeline(skeleton).get_path_name())]
        unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(
            folder, unreal.InterchangeManager.create_source_data(path), params)
        anims = []
        for p in sorted(set(_assets_in(folder)) - before):
            a = unreal.load_asset(p)
            if isinstance(a, unreal.AnimSequence):
                anims.append({"animation": p, "length_s": round(a.get_play_length(), 3),
                              "skeleton": _path(a.get_skeleton())})
        if not anims:
            raise RuntimeError(f"No animation was imported from {path}.")
        return json.dumps({"animations": anims})

    @toolset_registry.tool_call
    @staticmethod
    def retarget_animations(animation_paths: list[str], target_mesh_path: str, folder_path: str,
                            source_mesh_path: str = _MANNEQUIN, include_referenced: bool = False) -> str:
        """Copies animations from one character to another with an IK Retargeter that Unreal
        generates automatically, like Retarget Animation Assets with Auto Generate Retargeter on.
        By default the source is the Third Person template's mannequin.

        Args:
            animation_paths: Animations to copy, e.g. /Game/Characters/Mannequins/Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd.
            target_mesh_path: The Meshy character's skeletal mesh.
            folder_path: Folder for the retargeted animations and the IK Rig and Retargeter assets.
            source_mesh_path: The skeletal mesh the animations were made for.
            include_referenced: True when a path is an animation blueprint or a blend space:
                every clip and blend space it uses is copied too, and the copy uses those
                copies. This is how a Meshy character takes over the Third Person template's
                player: copy ABP_Unarmed, then set the player Blueprint's mesh and anim class.

        Returns:
            JSON with each retargeted animation's path and length, the retarget chains matched,
            root_motion: the root and pelvis bones the retargeter was pointed at, and
            also_created: other new assets in the folder, such as an anim blueprint's copy (use
            the name given here: when one of that name existed, Unreal adds a number). Each
            animation also has hips_travel_cm and source_pelvis_travel_cm, how far the hips move
            from their start relative to the root in the copy and in the original, and
            travel_ok, false when the copy's hips travel far more than the original's (or more
            than 100 cm for a clip copied through include_referenced). That means the clip's
            forward motion sits on the hips, and a character driven by it would run ahead of
            its collision: say so instead of using the clip.
        """
        folder = _folder(folder_path)
        before = set(_assets_in(folder)) if _eal.does_directory_exist(folder) else set()
        source = unreal.load_asset(source_mesh_path)
        target = unreal.load_asset(target_mesh_path)
        if not isinstance(source, unreal.SkeletalMesh) or not isinstance(target, unreal.SkeletalMesh):
            raise ValueError("source_mesh_path and target_mesh_path must be skeletal meshes.")
        tools = unreal.AssetToolsHelpers.get_asset_tools()

        def rig_for(mesh, name):
            path = f"{folder}/{name}"
            if _eal.does_asset_exist(path):
                return unreal.load_asset(path)
            rig = tools.create_asset(name, folder, unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
            ctl = unreal.IKRigController.get_controller(rig)
            ctl.set_skeletal_mesh(mesh)
            ctl.apply_auto_generated_retarget_definition()
            return rig

        src_rig = rig_for(source, "IK_" + source.get_name())
        dst_rig = rig_for(target, "IK_" + target.get_name())
        rtg_name = f"RTG_{source.get_name()}_to_{target.get_name()}"
        rtg_path = f"{folder}/{rtg_name}"
        if _eal.does_asset_exist(rtg_path):
            rtg = unreal.load_asset(rtg_path)
        else:
            rtg = tools.create_asset(rtg_name, folder, unreal.IKRetargeter, unreal.IKRetargetFactory())
            rc = unreal.IKRetargeterController.get_controller(rtg)
            rc.add_default_ops()
            for side, rig, mesh in ((unreal.RetargetSourceOrTarget.SOURCE, src_rig, source),
                                    (unreal.RetargetSourceOrTarget.TARGET, dst_rig, target)):
                rc.set_ik_rig(side, rig)
                rc.assign_ik_rig_to_all_ops(side, rig)
                rc.set_preview_mesh(side, mesh)
            rc.auto_map_chains(unreal.AutoMapChainType.FUZZY, True)
            try:
                rc.auto_align_all_bones(unreal.RetargetSourceOrTarget.TARGET)
            except Exception:
                pass
        root_motion = _set_root_motion_bones(rtg, src_rig, dst_rig)
        src_pelvis = str(unreal.IKRigController.get_controller(src_rig).get_retarget_root())
        data = []
        for p in animation_paths:
            ad = _eal.find_asset_data(p)
            if not ad.is_valid():
                raise ValueError(f"No animation at {p}.")
            data.append(ad)
        made = unreal.IKRetargetBatchOperation.duplicate_and_retarget(
            data, source, target, rtg, "", "", "", "_" + target.get_name(), folder, False,
            bool(include_referenced), True)
        out = []
        sources = {p.rstrip("/").split("/")[-1].split(".")[0]: p for p in animation_paths}
        suffix = "_" + target.get_name()
        for ad in made:
            anim = unreal.load_asset(str(ad.package_name))
            item = {"animation": str(ad.package_name),
                    "length_s": round(anim.get_play_length(), 3) if anim else None}
            name = str(ad.asset_name)
            source_path = sources.get(name[:-len(suffix)] if name.endswith(suffix) else name)
            if isinstance(anim, unreal.AnimSequence):
                hips = _bone_travel(anim, root_motion["target_pelvis"])
                original = _bone_travel(unreal.load_asset(source_path), src_pelvis) if source_path else None
                item["hips_travel_cm"], item["source_pelvis_travel_cm"] = hips, original
                if hips is None:
                    item["travel_ok"] = None
                else:
                    item["travel_ok"] = hips <= (100 if original is None else 3 * original + 20)
            else:
                item["type"] = anim.get_class().get_name() if anim else None
            out.append(item)
        chains = [str(c) for c in unreal.IKRigController.get_controller(dst_rig).get_retarget_chains()]
        also = sorted(set(_assets_in(folder)) - before - {item["animation"] for item in out})
        return json.dumps({"animations": out, "retargeter": rtg_path, "target_chains": len(chains),
                           "root_motion": root_motion, "also_created": also})

    @toolset_registry.tool_call
    @staticmethod
    def spot_near_player_start(forward_m: float = 3.0, right_m: float = 0.0,
                               player_start_path: str = "") -> str:
        """Finds a spot relative to the level's PlayerStart, where the player appears, and the
        yaw that faces back toward it. Use its x_cm, y_cm and face_yaw_deg with place_model or
        place_character.

        Args:
            forward_m: Metres in front of the PlayerStart, along the way it faces.
            right_m: Metres to its right; negative is to its left.
            player_start_path: Full actor path when more than one PlayerStart exists.

        Returns:
            JSON with the PlayerStart's location and yaw, the spot's x_cm and y_cm, and
            face_yaw_deg, the yaw that turns something at the spot toward the PlayerStart.
        """
        starts = unreal.GameplayStatics.get_all_actors_of_class(_world(), unreal.PlayerStart)
        if not starts:
            raise RuntimeError("This level has no PlayerStart.")
        if player_start_path:
            starts = [a for a in starts if a.get_path_name() == player_start_path]
        if len(starts) != 1:
            raise ValueError("Choose one PlayerStart by its full actor path, or use an explicit transform.")
        ps = starts[0]
        loc, yaw = ps.get_actor_location(), ps.get_actor_rotation().yaw
        r = math.radians(yaw)
        x = loc.x + 100 * (forward_m * math.cos(r) - right_m * math.sin(r))
        y = loc.y + 100 * (forward_m * math.sin(r) + right_m * math.cos(r))
        face = math.degrees(math.atan2(loc.y - y, loc.x - x))
        return json.dumps({"player_start_cm": [round(loc.x, 1), round(loc.y, 1), round(loc.z, 1)],
                           "player_start_yaw_deg": round(yaw, 1), "x_cm": round(x, 1), "y_cm": round(y, 1),
                           "face_yaw_deg": round(face, 1), "floor_hint_z_cm": loc.z})

    @toolset_registry.tool_call
    @staticmethod
    def place_model(asset_path: str, x_cm: float, y_cm: float, yaw_deg: float = 0.0,
                    floor_hint_z_cm: float = 0.0) -> str:
        """Places a static mesh in the open level standing on the ground: it traces down at nine
        points under the mesh's footprint and sets its lowest point on the highest one, wherever
        the mesh's pivot is, so no part sinks into a slope or step. One undoable step; nothing
        is saved.

        Args:
            asset_path: The static mesh, e.g. /Game/Meshy/Rocket/rocket.
            x_cm: World X in centimetres.
            y_cm: World Y in centimetres.
            yaw_deg: Rotation around the vertical axis.
            floor_hint_z_cm: Approximate target floor elevation; inspect the trace result in multi-floor scenes.

        Returns:
            JSON with the actor's label and path, location, yaw, size, the actors under its
            footprint (stands_on), whether that ground is level (the highest and lowest points
            under it within 5 cm; ground_drop_cm is the difference), and any mesh actors it
            overlaps. These are ground/bounding-box heuristics; inspect them against the
            requested intent. Slopes and deliberate intersections can be correct.
        """
        asset = unreal.load_asset(asset_path)
        if not isinstance(asset, unreal.StaticMesh):
            raise ValueError(f"{asset_path} is not a static mesh.")
        with unreal.ScopedEditorTransaction("Meshy: place model"):
            actor, floor, under = _spawn_on_floor(asset, x_cm, y_cm, yaw_deg, floor_hint_z_cm)
        return json.dumps(_actor_report(actor, floor, under))

    @toolset_registry.tool_call
    @staticmethod
    def place_character(skeletal_mesh_path: str, x_cm: float, y_cm: float, face_yaw_deg: float,
                        animation_path: str, mesh_forward_yaw_deg: float = 90.0,
                        floor_hint_z_cm: float = 0.0) -> str:
        """Places a skeletal mesh in the open level on the ground, turned so its face points
        along face_yaw_deg, optionally looping an animation. Meshy rigged characters face +Y,
        which is mesh_forward_yaw_deg 90; the tool subtracts it so face_yaw_deg is where the
        face points. One undoable step; nothing is saved.

        Args:
            skeletal_mesh_path: The character, e.g. /Game/Meshy/Mechanic/rigged_character.
            x_cm: World X in centimetres.
            y_cm: World Y in centimetres.
            face_yaw_deg: World yaw the face should point along (0 is +X). spot_near_player_start
                returns the yaw that faces the PlayerStart.
            floor_hint_z_cm: Approximate target floor elevation; verify what the trace hits.
            animation_path: Animation to loop, e.g. /Game/Meshy/Mechanic/walking_fbx, or an empty string for none.
            mesh_forward_yaw_deg: Direction the mesh faces in its own space. Leave at 90 for Meshy.

        Returns:
            JSON as place_model returns (stands_on, level, ground_drop_cm, overlaps: check them the
            same way), plus face_yaw_deg and the animation it plays.
        """
        mesh = unreal.load_asset(skeletal_mesh_path)
        if not isinstance(mesh, unreal.SkeletalMesh):
            raise ValueError(f"{skeletal_mesh_path} is not a skeletal mesh.")
        anim = None
        if animation_path:
            anim = unreal.load_asset(animation_path)
            if not isinstance(anim, unreal.AnimationAsset):
                raise ValueError(f"{animation_path} is not an animation.")
        with unreal.ScopedEditorTransaction("Meshy: place character"):
            actor, floor, under = _spawn_on_floor(mesh, x_cm, y_cm, face_yaw_deg - mesh_forward_yaw_deg, floor_hint_z_cm)
            if anim is not None:
                comp = actor.skeletal_mesh_component
                comp.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
                comp.override_animation_data(anim, True, True, 0.0, 1.0)
        report = _actor_report(actor, floor, under)
        report["face_yaw_deg"] = round(face_yaw_deg, 1)
        report["animation"] = _path(anim)
        return json.dumps(report)

    @toolset_registry.tool_call
    @staticmethod
    def place_at_transform(asset_path: str, location_cm: list[float],
                           rotation_deg: list[float], scale: list[float]) -> str:
        """Places a static or skeletal mesh at the requested world transform, without floor snapping.

        Args:
            asset_path: Static or skeletal mesh path.
            location_cm: World [x, y, z] in centimetres.
            rotation_deg: [pitch, yaw, roll] in degrees.
            scale: Positive [x, y, z] scale. Attachments use the editor's attachment tools afterwards.

        Returns:
            Actor path and transform, with save_pending. Ground checks do not apply to this mode.
        """
        # Reflected tool calls supply unreal.Array, which json cannot serialize.
        # Normalize before spawning so response serialization cannot strand an actor.
        location_cm, rotation_deg, scale = [
            [float(v) for v in values] for values in (location_cm, rotation_deg, scale)]
        for values in (location_cm, rotation_deg, scale):
            if len(values) != 3 or not all(math.isfinite(float(v)) for v in values):
                raise ValueError("Each transform field must contain three finite numbers.")
        if any(v <= 0 for v in scale):
            raise ValueError("Scale components must be positive.")
        asset = unreal.load_asset(asset_path)
        if not isinstance(asset, (unreal.StaticMesh, unreal.SkeletalMesh)):
            raise ValueError("asset_path must identify a static or skeletal mesh.")
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        with unreal.ScopedEditorTransaction("Meshy: place at transform"):
            actor = subsystem.spawn_actor_from_object(
                asset, unreal.Vector(*location_cm),
                unreal.Rotator(pitch=rotation_deg[0], yaw=rotation_deg[1], roll=rotation_deg[2]))
            if actor is None:
                raise RuntimeError("Could not spawn the mesh.")
            actor.set_actor_scale3d(unreal.Vector(*scale))
        return json.dumps({"actor": actor.get_actor_label(), "actor_path": actor.get_path_name(),
                           "location_cm": location_cm, "rotation_deg": rotation_deg,
                           "scale": scale, "placement": "transform", "save_state": "save_pending"})

    @toolset_registry.tool_call
    @staticmethod
    def check_actors(actor_labels: list[str]) -> str:
        """Checks actors that are already in the open level, without moving them: what each one
        stands on, whether that ground is level, how far its lowest point is above or below it,
        and what it overlaps. Use it after an asset was updated in place, or when the user asks
        whether things stand right.

        Args:
            actor_labels: Full actor paths (preferred) or unambiguous Outliner labels. Pass an empty list to check
                every actor whose mesh is under /Game/Meshy.

        Returns:
            JSON with one report per actor, as place_model returns (stands_on, level,
            ground_drop_cm, overlaps), plus gap_cm: how far the actor's lowest point is above
            the highest ground under it (negative means it sinks in), mesh, its asset path, and
            attached_to, the actor it is attached to (a held prop: ignore its ground fields).
            Labels that match no actor are listed in not_found. A character's bounds can sit a
            few centimetres off its feet; confirm a small gap in a capture before moving it.
        """
        def mesh_of(actor):
            for cls, prop in ((unreal.StaticMeshComponent, "static_mesh"),
                              (unreal.SkeletalMeshComponent, "skeletal_mesh_asset")):
                for comp in actor.get_components_by_class(cls):
                    try:
                        mesh = comp.get_editor_property(prop)
                    except Exception:
                        mesh = None
                    if mesh:
                        return _path(mesh)
            return ""

        every = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
        wanted = [str(label) for label in actor_labels]
        if wanted:
            chosen, missing = [], []
            for identifier in wanted:
                matches = [a for a in every if a.get_path_name() == identifier]
                if not matches:
                    matches = [a for a in every if a.get_actor_label().lower() == identifier.lower()]
                if len(matches) > 1:
                    raise ValueError(f"Ambiguous actor label {identifier}; pass its full actor path.")
                if matches:
                    chosen.extend(matches)
                else:
                    missing.append(identifier)
        else:
            chosen = [a for a in every if mesh_of(a).startswith("/Game/Meshy/")]
            missing = []
        reports = []
        for actor in chosen:
            top, low, under = _ground(actor)
            report = _actor_report(actor, (top, low), under)
            origin, extent = actor.get_actor_bounds(False)
            report["gap_cm"] = None if top is None else round(origin.z - extent.z - top, 1) + 0.0
            report["mesh"] = mesh_of(actor)
            parent = actor.get_attach_parent_actor()
            report["attached_to"] = parent.get_actor_label() if parent else ""
            reports.append(report)
        return json.dumps({"actors": reports, "not_found": missing})

    @toolset_registry.tool_call
    @staticmethod
    def version() -> str:
        """Returns this toolset's version, to check that the project's copy is current."""
        return MESHY_TOOLSET_VERSION

    @toolset_registry.tool_call
    @staticmethod
    def reload() -> str:
        """Reloads this toolset from Content/Python/meshy_toolset.py on the next editor tick,
        after the file was updated, so no editor restart is needed. Call version() a second
        later to confirm the new version."""
        _after_tick(lambda: toolset_registry.reload_module(sys.modules[__name__]))
        return "reload scheduled"


def _after_tick(fn):
    handle = None

    def run(_delta):
        unreal.unregister_slate_post_tick_callback(handle)
        try:
            fn()
            unreal.log(f"MeshyTools: reloaded, version {sys.modules[__name__].MESHY_TOOLSET_VERSION}")
        except Exception as exc:
            unreal.log_error(f"MeshyTools: reload failed: {exc}")

    handle = unreal.register_slate_post_tick_callback(run)


_registration = Registration([MeshyTools])


def register():
    """Registers MeshyTools now, or on the next editor tick if the registry isn't ready yet."""
    if _registration.register():
        unreal.log("MeshyTools: registered with the toolset registry")
        return
    handle = None

    def retry(_delta):
        if _registration.register():
            unreal.log("MeshyTools: registered with the toolset registry")
            unreal.unregister_slate_post_tick_callback(handle)

    handle = unreal.register_slate_post_tick_callback(retry)
