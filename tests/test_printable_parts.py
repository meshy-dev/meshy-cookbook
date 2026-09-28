"""Offline lifecycle tests for cookbook 10. No test creates a Meshy task."""

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
spec = importlib.util.spec_from_file_location("printable", ROOT / "examples/10-image-to-printable-parts/python/main.py")
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)

MODEL_PAYLOAD = {"should_texture": False, "target_formats": ["glb"]}
CHECK_PAYLOAD = {"input_task_id": "model-id"}
SPLIT_PAYLOAD = {"input_task_id": "model-id", "target_formats": ["glb", "3mf"], "layout": "on_plate"}
PRINTABILITY = {
    "_version": "v1", "status": "warning", "issue_count": 1, "error_count": 0, "warning_count": 1,
    "metrics": {"is_watertight": True, "volume": 1.25, "non_manifold_edges": 0, "degenerate_faces": 12, "holes": 0},
}
IDS = {"image-to-3d": "model-id", "print/analyze": "check-id", "print/split": "split-id"}


def task(endpoint, task_id):
    base = {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 0}
    if endpoint == "image-to-3d":
        base.update(consumed_credits=20, model_urls={"glb": "https://example.invalid/model.glb?signature=private"}, thumbnail_url="https://example.invalid/preview")
    elif endpoint == "print/analyze":
        base.update(printability=PRINTABILITY)
    else:
        base.update(consumed_credits=10, part_count=5, thumbnail_url="https://example.invalid/plate",
                    model_urls={"glb": "https://example.invalid/parts.glb", "3mf": "https://example.invalid/parts.3mf?signature=private"})
    return base


class PrintablePartsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = lambda endpoint, payload: IDS[endpoint]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)

    def state(self, model="model-id", split="split-id", **changes):
        state = {"version": 1, "image": str(recipe.SAMPLE), "model_task_id": model, "split_task_id": split, "creating": None}
        state.update(changes)
        recipe.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_the_three_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            recipe.run(output=self.output, client=self.client)
        (model_call, check_call, split_call) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        self.assertEqual(check_call.args, ("print/analyze", CHECK_PAYLOAD))
        self.assertEqual(split_call.args, ("print/split", SPLIT_PAYLOAD))
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["model-thumbnail.png", "printable-parts.3mf", "printable-parts.glb", "printable-parts-thumbnail.png"])
        self.assertEqual(json.loads((self.output / "printability.json").read_text()), PRINTABILITY)
        printed = [call.args[0] for call in print_output.call_args_list]
        self.assertIn("Printability warning: watertight yes, 0 holes, 0 non-manifold edges, 12 degenerate faces", printed)
        self.assertIn("5 parts, 30 credits total", printed[-1])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["split_task_id"], "split-id")
        self.assertNotIn("https", state_text)
        self.assertNotIn("check-id", state_text)  # the free check is not checkpointed

    def test_custom_image_reaches_the_payload_and_the_checkpoint(self):
        image = self.output / "figure.png"
        image.write_bytes(recipe.SAMPLE.read_bytes()[:64])
        with patch("builtins.print"):
            recipe.run(str(image), output=self.output, client=self.client)
        self.assertTrue(self.client.create.call_args_list[0].args[1]["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(json.loads((self.output / "run.json").read_text())["image"], str(image))

    def test_resume_both_stages_never_creates_or_reads_image(self):
        self.state(image="/missing/figure.png")
        with patch("builtins.print") as print_output:
            recipe.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("print/split", "split-id", label="split")
        self.assertIn("10 split credits; model stage excluded", print_output.call_args.args[0])
        self.assertFalse((self.output / "printability.json").exists())

    def test_resume_model_repeats_the_free_check_and_creates_only_the_split(self):
        self.state(image="/missing/figure.png", split=None)
        with patch("builtins.print"):
            recipe.run(resume=True, output=self.output, client=self.client)
        self.assertEqual([call.args for call in self.client.create.call_args_list], [("print/analyze", CHECK_PAYLOAD), ("print/split", SPLIT_PAYLOAD)])
        self.assertTrue((self.output / "printability.json").exists())

    def test_interrupt_after_model_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            recipe.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), ("model-id", None))

    def test_interrupt_during_the_check_resumes_without_a_second_model_task(self):
        self.client.wait.side_effect = lambda endpoint, task_id, label="": (_ for _ in ()).throw(KeyboardInterrupt) if endpoint == "print/analyze" else task(endpoint, task_id)
        with self.assertRaises(KeyboardInterrupt):
            recipe.run(output=self.output, client=self.client)
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)
        with patch("builtins.print"):
            recipe.run(resume=True, output=self.output, client=self.client)
        self.assertEqual([call.args[0] for call in self.client.create.call_args_list], ["image-to-3d", "print/analyze", "print/analyze", "print/split"])

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
            {"version": True}, {"image": ""}, {"model_task_id": None}, {"split_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "split"}, {"creating": "check"}, {"extra": "secret"},
        ]
        with patch.object(recipe, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    recipe.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Image differs"):
                recipe.run("other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                recipe.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_image_fails_before_client_and_checkpoint(self):
        for image, message in [("missing.png", "does not exist"), ("wrong.gif", "PNG or JPEG")]:
            with self.subTest(image=image), patch.object(recipe, "Meshy", wraps=recipe.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    recipe.run(image, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
