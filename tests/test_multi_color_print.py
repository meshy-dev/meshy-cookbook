"""Offline lifecycle tests for cookbook 11. No test creates a Meshy task."""

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
spec = importlib.util.spec_from_file_location("multicolor", ROOT / "examples/11-image-to-multi-color-print/python/main.py")
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)

MODEL_PAYLOAD = {"should_texture": True, "enable_pbr": False, "target_formats": ["glb"]}
PRINT_PAYLOAD = {"input_task_id": "model-id", "max_colors": 4, "style": "realistic"}


def task(endpoint, task_id):
    if endpoint == "print/multi-color":
        return {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 10,
                "model_urls": {"3mf": "https://example.invalid/print.3mf?signature=private"}}
    return {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 30,
            "model_urls": {"glb": "https://example.invalid/model.glb?signature=private"},
            "thumbnail_url": "https://example.invalid/preview"}


class MultiColorPrintTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["model-id", "print-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, model="model-id", print_task="print-id", **changes):
        state = {"version": 1, "image": str(recipe.SAMPLE_IMAGE), "style": "realistic", "model_task_id": model, "print_task_id": print_task, "creating": None}
        state.update(changes)
        recipe.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_both_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            recipe.run(output=self.output, client=self.client)
        (model_call, print_call) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        self.assertEqual(print_call.args, ("print/multi-color", PRINT_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["textured-model.glb", "textured-model-thumbnail.png", "multi-color-print.3mf"])
        self.assertIn("40 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["print_task_id"], "print-id")
        self.assertNotIn("https", state_text)

    def test_custom_image_and_style_reach_the_payloads(self):
        image = self.output / "prop.png"
        image.write_bytes(recipe.SAMPLE_IMAGE.read_bytes()[:64])
        with patch("builtins.print"):
            recipe.run(str(image), "cartoon", output=self.output, client=self.client)
        (model_call, print_call) = self.client.create.call_args_list
        self.assertTrue(model_call.args[1]["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(print_call.args[1]["style"], "cartoon")
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["image"], state["style"]), (str(image), "cartoon"))

    def test_resume_both_stages_never_creates_or_reads_image(self):
        self.state(image="/missing/prop.png")
        with patch("builtins.print") as print_output:
            recipe.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("print/multi-color", "print-id", label="print")
        self.assertIn("10 print credits; model stage excluded", print_output.call_args.args[0])

    def test_resume_model_creates_only_print(self):
        self.state(image="/missing/prop.png", print_task=None, style="cartoon")
        self.client.create.side_effect = ["print-id"]
        with patch("builtins.print"):
            recipe.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("print/multi-color", {**PRINT_PAYLOAD, "style": "cartoon"})

    def test_interrupt_after_model_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            recipe.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), ("model-id", None))

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            recipe.run(output=self.output, client=self.client)
        with patch.object(recipe, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                recipe.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_invalid_state_inputs_and_new_run_rejected_before_client(self):
        cases = [
            {"version": True}, {"image": ""}, {"style": "vivid"}, {"style": None}, {"model_task_id": None}, {"print_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "print"}, {"extra": "secret"},
        ]
        with patch.object(recipe, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    recipe.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Image differs"):
                recipe.run("other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "Style differs"):
                recipe.run(None, "cartoon", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                recipe.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_inputs_fail_before_client_and_checkpoint(self):
        cases = [("missing.png", None, "does not exist"), ("wrong.gif", None, "PNG or JPEG"), (None, "vivid", "realistic or cartoon"), (None, "Realistic", "realistic or cartoon")]
        for image, style, message in cases:
            with self.subTest(image=image, style=style), patch.object(recipe, "Meshy", wraps=recipe.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    recipe.run(image, style, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
