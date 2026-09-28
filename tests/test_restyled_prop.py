"""Offline lifecycle tests for cookbook 06. No test creates a Meshy task."""

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
spec = importlib.util.spec_from_file_location("restyled", ROOT / "examples/06-text-to-restyled-prop/python/main.py")
restyled = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restyled)

MODEL_PAYLOAD = {
    "model_type": "smart-topology", "target_polycount": 1000,
    "should_texture": False, "target_formats": ["glb"],
}
RETEXTURE_PAYLOAD = {
    "input_task_id": "model-id", "text_style_prompt": restyled.SAMPLE_PROMPT,
    "enable_original_uv": False, "enable_pbr": True, "target_formats": ["glb"],
}
TEXTURE_FILES = ["base-color.png", "metallic.png", "roughness.png", "normal.png"]


def task(endpoint, task_id):
    base = {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 10 if endpoint == "retexture" else 5,
            "model_urls": {"glb": "https://example.invalid/model.glb?signature=private"}, "thumbnail_url": "https://example.invalid/preview"}
    if endpoint == "retexture":
        base["texture_urls"] = [{"base_color": "https://example.invalid/base", "metallic": "https://example.invalid/metallic",
                                 "roughness": "https://example.invalid/roughness", "normal": "https://example.invalid/normal"}]
    return base


class RestyledPropTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["model-id", "retexture-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, model="model-id", retexture="retexture-id", **changes):
        state = {"version": 1, "prompt": restyled.SAMPLE_PROMPT, "image": str(restyled.SAMPLE_IMAGE),
                 "model_task_id": model, "retexture_task_id": retexture, "creating": None}
        state.update(changes)
        restyled.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_both_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            restyled.run(output=self.output, client=self.client)
        (model_call, retexture_call) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        self.assertEqual(retexture_call.args, ("retexture", RETEXTURE_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["low-poly-prop-thumbnail.png", "restyled-prop.glb", "restyled-prop-thumbnail.png", *TEXTURE_FILES])
        self.assertIn("15 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["retexture_task_id"], "retexture-id")
        self.assertNotIn("https", state_text)

    def test_custom_prompt_and_image_reach_the_payloads(self):
        image = self.output / "prop.png"
        image.write_bytes(restyled.SAMPLE_IMAGE.read_bytes()[:64])
        with patch("builtins.print"):
            restyled.run("Blue stone", str(image), output=self.output, client=self.client)
        (model_call, retexture_call) = self.client.create.call_args_list
        self.assertTrue(model_call.args[1]["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(retexture_call.args[1]["text_style_prompt"], "Blue stone")
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["prompt"], state["image"]), ("Blue stone", str(image)))

    def test_resume_both_stages_never_creates_or_reads_image(self):
        self.state(image="/missing/prop.png")
        with patch("builtins.print") as print_output:
            restyled.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("retexture", "retexture-id", label="retexture")
        self.assertIn("10 retexture credits; model stage excluded", print_output.call_args.args[0])

    def test_resume_model_creates_only_retexture(self):
        self.state(image="/missing/prop.png", retexture=None)
        self.client.create.side_effect = ["retexture-id"]
        with patch("builtins.print"):
            restyled.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("retexture", RETEXTURE_PAYLOAD)

    def test_interrupt_after_model_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            restyled.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), ("model-id", None))

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            restyled.run(output=self.output, client=self.client)
        with patch.object(restyled, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                restyled.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_invalid_state_inputs_and_new_run_rejected_before_client(self):
        cases = [
            {"version": True}, {"prompt": " "}, {"image": ""}, {"model_task_id": None}, {"retexture_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "retexture"}, {"extra": "secret"},
        ]
        with patch.object(restyled, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    restyled.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Prompt differs"):
                restyled.run("other style", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "Image differs"):
                restyled.run(None, "other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                restyled.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_inputs_fail_before_client_and_checkpoint(self):
        cases = [(None, "missing.png", "does not exist"), (None, "wrong.gif", "PNG or JPEG"), ("  ", None, "empty"), ("x" * 801, None, "800 characters")]
        for prompt, image, message in cases:
            with self.subTest(prompt=prompt, image=image), patch.object(restyled, "Meshy", wraps=restyled.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    restyled.run(prompt, image, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
