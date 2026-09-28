"""Offline lifecycle tests for cookbook 05. No test creates a Meshy task."""

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
spec = importlib.util.spec_from_file_location("rigged", ROOT / "examples/05-image-to-rigged-character/python/main.py")
rigged = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rigged)

MODEL_PAYLOAD = {
    "pose_mode": "a-pose", "should_remesh": True, "target_polycount": 30000,
    "should_texture": True, "enable_pbr": True, "target_formats": ["glb"],
}
RIG_PAYLOAD = {"input_task_id": "model-id", "height_meters": 1.8}


def task(endpoint, task_id):
    base = {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 5 if endpoint == "rigging" else 30}
    if endpoint == "rigging":
        base["result"] = {
            "rigged_character_glb_url": "https://example.invalid/rig.glb?signature=private",
            "rigged_character_fbx_url": "https://example.invalid/rig.fbx",
            "basic_animations": {"walking_glb_url": "https://example.invalid/walk.glb", "running_glb_url": "https://example.invalid/run.glb"},
        }
    else:
        base.update(model_urls={"glb": "https://example.invalid/model"}, thumbnail_url="https://example.invalid/preview")
    return base


class RiggedCharacterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["model-id", "rig-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, model="model-id", rig="rig-id", **changes):
        state = {"version": 1, "image": str(rigged.SAMPLE), "model_task_id": model, "rig_task_id": rig, "creating": None}
        state.update(changes)
        rigged.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_both_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            rigged.run(output=self.output, client=self.client)
        (model_call, rig_call) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        self.assertEqual(rig_call.args, ("rigging", RIG_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["character-thumbnail.png", "rigged-character.glb", "rigged-character.fbx", "walking.glb", "running.glb"])
        self.assertIn("35 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["rig_task_id"], "rig-id")
        self.assertNotIn("https", state_text)

    def test_resume_both_stages_never_creates_or_reads_image(self):
        self.state(image="/missing/character.png")
        with patch("builtins.print") as print_output:
            rigged.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("rigging", "rig-id", label="rig")
        self.assertIn("5 rig credits; model stage excluded", print_output.call_args.args[0])

    def test_resume_model_creates_only_rig(self):
        self.state(image="/missing/character.png", rig=None)
        self.client.create.side_effect = ["rig-id"]
        with patch("builtins.print"):
            rigged.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("rigging", RIG_PAYLOAD)

    def test_interrupt_after_model_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            rigged.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), ("model-id", None))

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            rigged.run(output=self.output, client=self.client)
        with patch.object(rigged, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                rigged.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_invalid_state_image_and_new_run_rejected_before_client(self):
        cases = [
            {"version": True}, {"image": ""}, {"model_task_id": None}, {"rig_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "rig"}, {"extra": "secret"},
        ]
        with patch.object(rigged, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    rigged.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "differs"):
                rigged.run("other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                rigged.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_image_fails_before_client_and_checkpoint(self):
        for image in ["missing.png", "wrong.gif"]:
            with self.subTest(image=image), patch.object(rigged, "Meshy", wraps=rigged.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, "PNG or JPEG|does not exist"):
                    rigged.run(image, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
