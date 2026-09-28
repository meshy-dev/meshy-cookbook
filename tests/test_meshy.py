"""Offline reliability checks. No Meshy requests or credits are used."""

import importlib.util
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from shared.python.meshy import Meshy, MeshyAPIError, MeshyTaskError, MeshyTimeoutError

spec = importlib.util.spec_from_file_location("hero_prop", ROOT / "examples/03-text-to-hero-prop/python/main.py")
hero = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hero)


def task(endpoint, task_id):
    return {"id": task_id, "status": "SUCCEEDED", "progress": 100,
            "image_urls": ["https://example.invalid/concept?signature=private"],
            "model_urls": {"glb": "https://example.invalid/model"},
            "thumbnail_url": "https://example.invalid/preview",
            "consumed_credits": 9 if endpoint == "text-to-image" else 35}


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["concept-id", "model-id"]
        self.client.wait.side_effect = task

    def state(self, concept="concept-id", model="model-id", **changes):
        state = {"version": 1, "prompt": "A chest", "concept_task_id": concept, "model_task_id": model, "creating": None}
        state.update(changes)
        hero.save_state(self.output / "run.json", state)
        return state

    def test_resume_both_stages_never_creates(self):
        self.state()
        hero.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("image-to-3d", "model-id")
        self.assertEqual(self.client.download.call_count, 2)

    def test_resume_model_does_not_depend_on_expired_concept(self):
        self.state()

        def expired_concept(endpoint, task_id):
            if endpoint == "text-to-image":
                raise MeshyAPIError(404, "expired concept")
            return task(endpoint, task_id)

        self.client.wait.side_effect = expired_concept
        with patch("builtins.print") as print_output:
            hero.run(resume=True, output=self.output, client=self.client)
        self.client.wait.assert_called_once_with("image-to-3d", "model-id")
        self.client.create.assert_not_called()
        self.assertIn("35 model credits; concept stage excluded", print_output.call_args.args[0])

    def test_resume_concept_creates_only_model(self):
        self.state(model=None)
        self.client.create.side_effect = ["model-id"]
        hero.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once_with("image-to-3d", {
            "input_task_id": "concept-id", "geometry_resolution": "4k",
            "should_texture": True, "enable_pbr": True, "texture_resolution": "4k", "target_formats": ["glb"],
        })
        self.assertEqual(json.loads((self.output / "run.json").read_text())["model_task_id"], "model-id")

    def test_interrupt_after_concept_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            hero.run("A chest", output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual(state["concept_task_id"], "concept-id")
        self.assertIsNone(state["creating"])

    def test_interrupt_after_model_creation_resumes_without_new_tasks(self):
        def interrupted(endpoint, task_id):
            if endpoint == "image-to-3d":
                raise KeyboardInterrupt
            return task(endpoint, task_id)

        self.client.wait.side_effect = interrupted
        with self.assertRaises(KeyboardInterrupt):
            hero.run("A chest", output=self.output, client=self.client)
        self.assertEqual(json.loads((self.output / "run.json").read_text())["model_task_id"], "model-id")
        self.client.wait.side_effect = task
        hero.run(resume=True, output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_count, 2)

    def test_new_run_checkpoints_ids_without_result_urls(self):
        hero.run("A chest", output=self.output, client=self.client)
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["model_task_id"], "model-id")
        self.assertNotIn("https", state_text)
        self.assertNotIn("signature", state_text)
        self.assertEqual([p.name for p in self.output.iterdir()], ["run.json"])

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            hero.run("A chest", output=self.output, client=self.client)
        with patch.object(hero, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                hero.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_invalid_state_and_prompt_rejected_before_client(self):
        cases = [
            {"version": True}, {"prompt": ""}, {"concept_task_id": 3},
            {"concept_task_id": None}, {"model_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "model"}, {"extra": "secret"},
        ]
        with patch.object(hero, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    hero.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "differs"):
                hero.run("Another prompt", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                hero.run(output=self.output)
            constructor.assert_not_called()


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = Meshy(api_key="offline-test", env_file=Path("/nonexistent/.env"))

    def test_text_to_3d_is_the_only_v2_endpoint(self):
        self.assertEqual(Meshy.url("text-to-3d"), "https://api.meshy.ai/openapi/v2/text-to-3d")
        for endpoint in ("image-to-3d", "multi-image-to-3d", "text-to-image", "rigging", "retexture", "remesh"):
            self.assertEqual(Meshy.url(endpoint), f"https://api.meshy.ai/openapi/v1/{endpoint}")

    @patch("shared.python.meshy.time.sleep")
    def test_transient_polling_errors_retry(self, sleep):
        done = task("image-to-3d", "model-id")
        self.client.get = MagicMock(side_effect=[requests.ConnectionError(), MeshyAPIError(503, "busy"), done])
        self.assertEqual(self.client.wait("image-to-3d", "model-id"), done)
        self.assertEqual(sleep.call_count, 2)

    def test_terminal_and_auth_errors_do_not_retry(self):
        for status in ("FAILED", "CANCELED"):
            self.client.get = MagicMock(return_value={"id": "x", "status": status, "task_error": {"message": "bad input"}})
            with self.assertRaisesRegex(MeshyTaskError, "bad input"):
                self.client.wait("image-to-3d", "x")
            self.client.get.assert_called_once()
        self.client.get = MagicMock(side_effect=MeshyAPIError(401, "unauthorized"))
        with self.assertRaises(MeshyAPIError):
            self.client.wait("image-to-3d", "x")
        self.client.get.assert_called_once()

    def test_pending_task_times_out(self):
        self.client.get = MagicMock(return_value={"id": "x", "status": "PENDING"})
        with self.assertRaises(MeshyTimeoutError):
            self.client.wait("image-to-3d", "x", timeout=0)

    def test_paid_post_network_error_is_not_retried(self):
        self.client.session.post = MagicMock(side_effect=requests.ConnectionError())
        with self.assertRaises(requests.ConnectionError):
            self.client.create("image-to-3d", {})
        self.client.session.post.assert_called_once()

    def test_failed_stream_preserves_previous_download(self):
        def chunks(**kwargs):
            yield b"partial"
            raise requests.ConnectionError("broken stream")

        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "model.glb"
            dest.write_bytes(b"previous")
            response = MagicMock(ok=True)
            response.__enter__.return_value = response
            response.iter_content.side_effect = chunks
            with patch("shared.python.meshy.requests.get", return_value=response) as get:
                with self.assertRaises(requests.ConnectionError):
                    self.client.download("https://example.invalid/signed", dest)
            self.assertEqual(dest.read_bytes(), b"previous")
            self.assertEqual(list(Path(directory).iterdir()), [dest])
            self.assertNotIn("headers", get.call_args.kwargs)

    def test_invalid_inputs_fail_before_client_construction(self):
        cases = [("02-image-to-low-poly-prop", ["missing.png", value]) for value in ["NaN", "2.5", "99", "15001", "Infinity"]]
        cases += [("02-image-to-low-poly-prop", ["missing.png"]), ("02-image-to-low-poly-prop", ["wrong.gif"]), ("04-photos-to-product-model", ["one.png"] * 5)]
        for recipe, args in cases:
            script = ROOT / f"examples/{recipe}/python/main.py"
            with self.subTest(args=args), patch.object(Meshy, "__init__", return_value=None) as constructor, patch.object(sys, "argv", [str(script), *args]):
                with self.assertRaises(ValueError):
                    runpy.run_path(str(script), run_name="__main__")
                constructor.assert_not_called()


if __name__ == "__main__":
    unittest.main()
