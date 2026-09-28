"""Offline lifecycle tests for cookbook 09. No test creates a Meshy task."""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("animated", ROOT / "examples/09-image-to-animated-character/python/main.py")
animated = importlib.util.module_from_spec(spec)
spec.loader.exec_module(animated)

MODEL_PAYLOAD = {
    "pose_mode": "a-pose", "should_remesh": True, "target_polycount": 30000,
    "should_texture": True, "enable_pbr": True, "target_formats": ["glb"],
}
RIG_PAYLOAD = {"input_task_id": "model-id", "height_meters": 1.8}
ANIMATION_PAYLOAD = {"rig_task_id": "rig-id", "action_ids": [0, 466, 4]}
CREDITS = {"image-to-3d": 30, "rigging": 5, "animations": 9}


def task(endpoint, task_id):
    base = {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": CREDITS[endpoint]}
    if endpoint == "rigging":
        base["result"] = {
            "rigged_character_glb_url": "https://example.invalid/rig.glb?signature=private",
            "rigged_character_fbx_url": "https://example.invalid/rig.fbx",
            "basic_animations": {"walking_glb_url": "https://example.invalid/walk.glb", "running_glb_url": "https://example.invalid/run.glb"},
        }
    elif endpoint == "animations":
        base["result"] = {
            "animation_glb_url": "https://example.invalid/clips.glb?signature=private",
            "animation_fbx_url": "https://example.invalid/clips.fbx",
        }
    else:
        base.update(model_urls={"glb": "https://example.invalid/model"}, thumbnail_url="https://example.invalid/preview")
    return base


class AnimatedCharacterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["model-id", "rig-id", "animation-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, model="model-id", rig="rig-id", animation="animation-id", **changes):
        state = {
            "version": 1, "image": str(animated.SAMPLE), "actions": [0, 466, 4],
            "model_task_id": model, "rig_task_id": rig, "animation_task_id": animation, "creating": None,
        }
        state.update(changes)
        animated.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_three_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            animated.run(output=self.output, client=self.client)
        (model_call, rig_call, animation_call) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        self.assertEqual(rig_call.args, ("rigging", RIG_PAYLOAD))
        self.assertEqual(animation_call.args, ("animations", ANIMATION_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["character-thumbnail.png", "animated-character.glb", "animated-character.fbx"])
        self.assertIn("44 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["animation_task_id"], "animation-id")
        self.assertNotIn("https", state_text)

    def test_custom_actions_reach_the_animation_payload_and_the_checkpoint(self):
        with patch("builtins.print"):
            animated.run([243, 463], output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_args_list[2].args, ("animations", {"rig_task_id": "rig-id", "action_ids": [243, 463]}))
        self.assertEqual(json.loads((self.output / "run.json").read_text())["actions"], [243, 463])

    def test_resume_all_stages_never_creates_or_reads_image(self):
        self.state(image="/missing/character.png")
        with patch("builtins.print") as print_output:
            animated.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("animations", "animation-id", label="animation")
        self.assertIn("9 animation credits; model and rig stages excluded", print_output.call_args.args[0])

    def test_resume_model_creates_rig_and_animation(self):
        self.state(image="/missing/character.png", rig=None, animation=None)
        self.client.create.side_effect = ["rig-id", "animation-id"]
        with patch("builtins.print") as print_output:
            animated.run(resume=True, output=self.output, client=self.client)
        self.assertEqual([call.args for call in self.client.create.call_args_list], [("rigging", RIG_PAYLOAD), ("animations", ANIMATION_PAYLOAD)])
        self.assertIn("44 credits total", print_output.call_args.args[0])  # the model task is retrieved again for its thumbnail

    def test_resume_rig_creates_only_animation(self):
        self.state(image="/missing/character.png", animation=None)
        self.client.create.side_effect = ["animation-id"]
        with patch("builtins.print") as print_output:
            animated.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("animations", ANIMATION_PAYLOAD)
        self.assertIn("14 credits for rig and animation; model stage excluded", print_output.call_args.args[0])

    def test_interrupt_after_model_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            animated.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), ("model-id", None))

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            animated.run(output=self.output, client=self.client)
        with patch.object(animated, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                animated.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_invalid_state_inputs_and_new_run_rejected_before_client(self):
        cases = [
            {"version": True}, {"image": ""}, {"actions": []}, {"actions": [0, 0]}, {"actions": ["4"]},
            {"model_task_id": None}, {"rig_task_id": None}, {"animation_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "animation"}, {"extra": "secret"},
        ]
        with patch.object(animated, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    animated.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Image differs"):
                animated.run(None, "other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "Actions differ"):
                animated.run([0, 466], resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                animated.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_image_or_actions_fail_before_client_and_checkpoint(self):
        for image in ["missing.png", "wrong.gif"]:
            with self.subTest(image=image), patch.object(animated, "Meshy", wraps=animated.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, "PNG or JPEG|does not exist"):
                    animated.run(None, image, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())
        for actions in [[], [0, 0], list(range(11)), [-1], [True], [4.0]]:
            with self.subTest(actions=actions), patch.object(animated, "Meshy", wraps=animated.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, "one to ten different action ids"):
                    animated.run(actions, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
