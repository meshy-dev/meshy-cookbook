"""Offline lifecycle tests for cookbook 07. No test creates a Meshy task."""

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
spec = importlib.util.spec_from_file_location("text_to_3d", ROOT / "examples/07-text-to-3d-prop/python/main.py")
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)

PREVIEW_PAYLOAD = {"mode": "preview", "prompt": recipe.SAMPLE_PROMPT, "should_remesh": False, "target_formats": ["glb"]}
REFINE_PAYLOAD = {"mode": "refine", "preview_task_id": "preview-id", "enable_pbr": True, "target_formats": ["glb"]}


def task(endpoint, task_id):
    return {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 10 if task_id == "refine-id" else 20,
            "model_urls": {"glb": "https://example.invalid/model.glb?signature=private"}, "thumbnail_url": "https://example.invalid/preview"}


class TextTo3dPropTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["preview-id", "refine-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, preview="preview-id", refine="refine-id", **changes):
        state = {"version": 1, "prompt": recipe.SAMPLE_PROMPT, "preview_task_id": preview, "refine_task_id": refine, "creating": None}
        state.update(changes)
        recipe.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_both_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            recipe.run(output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_args_list[0].args, ("text-to-3d", PREVIEW_PAYLOAD))
        self.assertEqual(self.client.create.call_args_list[1].args, ("text-to-3d", REFINE_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["preview-thumbnail.png", "textured-prop.glb", "textured-prop-thumbnail.png"])
        self.assertIn("30 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["refine_task_id"], "refine-id")
        self.assertNotIn("https", state_text)

    def test_custom_prompt_reaches_the_payload(self):
        with patch("builtins.print"):
            recipe.run("A ceramic teapot", output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_args_list[0].args[1]["prompt"], "A ceramic teapot")
        self.assertEqual(json.loads((self.output / "run.json").read_text())["prompt"], "A ceramic teapot")

    def test_resume_both_stages_never_creates(self):
        self.state()
        with patch("builtins.print") as print_output:
            recipe.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("text-to-3d", "refine-id", label="refine")
        self.assertIn("10 refine credits; preview stage excluded", print_output.call_args.args[0])

    def test_resume_preview_creates_only_refine(self):
        self.state(refine=None)
        self.client.create.side_effect = ["refine-id"]
        with patch("builtins.print"):
            recipe.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("text-to-3d", REFINE_PAYLOAD)

    def test_interrupt_after_preview_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            recipe.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["preview_task_id"], state["creating"]), ("preview-id", None))

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
            {"version": True}, {"prompt": " "}, {"preview_task_id": None}, {"refine_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "refine"}, {"extra": "secret"},
        ]
        with patch.object(recipe, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    recipe.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Prompt differs"):
                recipe.run("other description", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                recipe.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_prompts_fail_before_client_and_checkpoint(self):
        for prompt, message in [("  ", "empty"), ("x" * 801, "800 characters")]:
            with self.subTest(prompt=prompt), patch.object(recipe, "Meshy", wraps=recipe.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    recipe.run(prompt, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
