"""Offline lifecycle tests for cookbook 14. No test creates a Meshy task."""

import base64
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
spec = importlib.util.spec_from_file_location("style_matched", ROOT / "examples/14-image-to-style-matched-prop/python/main.py")
style_matched = importlib.util.module_from_spec(spec)
spec.loader.exec_module(style_matched)

PROMPT_TAIL = (
    ", full object, three-quarter front view, centered with space around it, painted in the same art style, "
    "palette and brushwork as the reference image, painted highlights and soft shadows, soft even studio lighting, "
    "plain white background, single object, no props, no text"
)
CONCEPT_PAYLOAD = {"ai_model": "gpt-image-2-5-sunburst", "prompt": style_matched.SAMPLE_DESCRIPTION + PROMPT_TAIL, "aspect_ratio": "1:1"}
MESH_PAYLOAD = {
    "input_task_id": "concept-id", "model_type": "smart-topology", "ai_model": "meshy-t2.5",
    "target_polycount": 5000, "should_texture": False, "target_formats": ["glb"],
}
TEXTURE_PAYLOAD = {"input_task_id": "mesh-id", "ai_model": "meshy-n1", "enable_pbr": False, "target_formats": ["glb"]}
CREDITS = {"image-to-image": 12, "image-to-3d": 5, "retexture": 10}
CONCEPT_BYTES = b"\x89PNG saved concept"


def task(endpoint, task_id):
    base = {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": CREDITS[endpoint]}
    if endpoint == "image-to-image":
        base["image_urls"] = ["https://example.invalid/concept.png?signature=private"]
    else:
        base.update(model_urls={"glb": "https://example.invalid/model?signature=private"}, thumbnail_url="https://example.invalid/preview")
    return base


def without(payload, key):
    """The payload minus a data URI field, after checking the field is a PNG data URI."""
    payload = dict(payload)
    value = payload.pop(key)
    if key == "reference_image_urls":
        assert len(value) == 1
        value = value[0]
    assert value.startswith("data:image/png;base64,"), value[:40]
    return payload


class StyleMatchedPropTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["concept-id", "mesh-id", "texture-id"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)
        self.client.download.side_effect = lambda url, dest: dest.write_bytes(CONCEPT_BYTES) and dest

    def state(self, concept="concept-id", mesh="mesh-id", texture="texture-id", **changes):
        state = {
            "version": 1, "description": style_matched.SAMPLE_DESCRIPTION, "reference": str(style_matched.SAMPLE_REFERENCE),
            "concept_task_id": concept, "mesh_task_id": mesh, "texture_task_id": texture, "creating": None,
        }
        state.update(changes)
        style_matched.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_three_payloads_in_order(self):
        with patch("builtins.print") as print_output:
            style_matched.run(output=self.output, client=self.client)
        (concept_call, mesh_call, texture_call) = self.client.create.call_args_list
        self.assertEqual(concept_call.args[0], "image-to-image")
        self.assertEqual(without(concept_call.args[1], "reference_image_urls"), CONCEPT_PAYLOAD)
        self.assertEqual(list(concept_call.args[1]), ["ai_model", "prompt", "reference_image_urls", "aspect_ratio"])
        self.assertEqual(mesh_call.args, ("image-to-3d", MESH_PAYLOAD))
        self.assertEqual(texture_call.args[0], "retexture")
        self.assertEqual(without(texture_call.args[1], "image_style_url"), TEXTURE_PAYLOAD)
        self.assertEqual(list(texture_call.args[1]), ["input_task_id", "ai_model", "image_style_url", "enable_pbr", "target_formats"])
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["prop-concept.png", "prop.glb", "prop-thumbnail.png"])
        self.assertIn("27 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text)["texture_task_id"], "texture-id")
        self.assertNotIn("https", state_text)

    def test_texture_stage_sends_the_saved_concept_file(self):
        with patch("builtins.print"):
            style_matched.run(output=self.output, client=self.client)
        sent = self.client.create.call_args_list[2].args[1]["image_style_url"]
        self.assertEqual(sent, "data:image/png;base64," + base64.b64encode(CONCEPT_BYTES).decode())

    def test_custom_description_and_reference_reach_the_concept_payload_and_the_checkpoint(self):
        reference = ROOT / "examples/13-image-to-threejs-character/input/concept-art.png"
        with patch("builtins.print"):
            style_matched.run("A sci-fi supply crate", str(reference), output=self.output, client=self.client)
        payload = self.client.create.call_args_list[0].args[1]
        self.assertEqual(payload["prompt"], "A sci-fi supply crate" + PROMPT_TAIL)
        self.assertEqual(payload["reference_image_urls"], [style_matched.Meshy.data_uri(reference)])
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["description"], state["reference"]), ("A sci-fi supply crate", str(reference)))

    def test_resume_all_stages_never_creates_or_reads_the_reference(self):
        self.state(reference="/missing/art.png")
        with patch("builtins.print") as print_output:
            style_matched.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.client.wait.assert_called_once_with("retexture", "texture-id", label="texture")
        self.assertIn("10 texture credits; concept and mesh stages excluded", print_output.call_args.args[0])

    def test_resume_concept_creates_mesh_and_texture(self):
        self.state(reference="/missing/art.png", mesh=None, texture=None)
        self.client.create.side_effect = ["mesh-id", "texture-id"]
        with patch("builtins.print") as print_output:
            style_matched.run(resume=True, output=self.output, client=self.client)
        calls = self.client.create.call_args_list
        self.assertEqual(calls[0].args, ("image-to-3d", MESH_PAYLOAD))
        self.assertEqual(without(calls[1].args[1], "image_style_url"), TEXTURE_PAYLOAD)
        self.assertIn("27 credits total", print_output.call_args.args[0])  # the concept task is retrieved again for its image

    def test_resume_mesh_creates_only_the_texture_from_the_saved_concept(self):
        self.state(reference="/missing/art.png", texture=None)
        (self.output / "prop-concept.png").write_bytes(CONCEPT_BYTES)
        self.client.create.side_effect = ["texture-id"]
        with patch("builtins.print") as print_output:
            style_matched.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_called_once()
        self.assertEqual(without(self.client.create.call_args.args[1], "image_style_url"), TEXTURE_PAYLOAD)
        self.assertIn("15 credits for mesh and texture; concept stage excluded", print_output.call_args.args[0])

    def test_missing_concept_file_stops_before_the_texture_post_without_a_marker(self):
        self.state(texture=None)
        with patch("builtins.print"), self.assertRaisesRegex(ValueError, "does not exist"):
            style_matched.run(resume=True, output=self.output, client=self.client)
        self.client.create.assert_not_called()
        self.assertIsNone(json.loads((self.output / "run.json").read_text())["creating"])

    def test_interrupt_after_concept_creation_keeps_its_id(self):
        self.client.wait.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            style_matched.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["concept_task_id"], state["creating"]), ("concept-id", None))

    def test_unknown_post_outcome_cannot_repeat_paid_creation(self):
        self.client.create.side_effect = requests.ConnectionError("lost response")
        with self.assertRaises(requests.ConnectionError):
            style_matched.run(output=self.output, client=self.client)
        with patch.object(style_matched, "Meshy") as constructor:
            with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
                style_matched.run(resume=True, output=self.output)
            constructor.assert_not_called()
        self.assertEqual(self.client.create.call_count, 1)

    def test_refused_texture_keeps_the_mesh_and_resume_retries_it(self):
        refused = style_matched.MeshyAPIError(400, "meshy-n1 does not support enable_pbr")
        self.client.create.side_effect = ["concept-id", "mesh-id", refused]
        with patch("builtins.print"), self.assertRaises(style_matched.MeshyAPIError):
            style_matched.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["concept_task_id"], state["mesh_task_id"], state["texture_task_id"], state["creating"]),
                         ("concept-id", "mesh-id", None, None))
        self.client.create.side_effect = ["texture-id"]
        with patch("builtins.print"):
            style_matched.run(resume=True, output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_args.args[0], "retexture")
        self.assertEqual(self.client.create.call_count, 4)

    def test_server_error_keeps_the_marker(self):
        self.client.create.side_effect = style_matched.MeshyAPIError(500, "Internal error")
        with self.assertRaises(style_matched.MeshyAPIError):
            style_matched.run(output=self.output, client=self.client)
        with self.assertRaisesRegex(ValueError, "outcome.*unknown"):
            style_matched.run(resume=True, output=self.output, client=self.client)

    def test_invalid_state_inputs_and_new_run_rejected_before_client(self):
        cases = [
            {"version": True}, {"description": " "}, {"reference": ""}, {"reference": None},
            {"concept_task_id": None}, {"mesh_task_id": None}, {"texture_task_id": "bad/id"},
            {"creating": "anything"}, {"creating": "texture"}, {"extra": "secret"},
        ]
        with patch.object(style_matched, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    style_matched.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Description differs"):
                style_matched.run("A barrel", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "Reference image differs"):
                style_matched.run(None, "other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                style_matched.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_reference_or_description_fail_before_client_and_checkpoint(self):
        for description, reference, message in [
            (None, "missing.png", "does not exist"), (None, "wrong.gif", "PNG, JPEG or WebP"), ("  ", None, "cannot be empty"),
        ]:
            with self.subTest(reference=reference), patch.object(style_matched, "Meshy", wraps=style_matched.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    style_matched.run(description, reference, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())


if __name__ == "__main__":
    unittest.main()
