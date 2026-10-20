"""Offline lifecycle and geometry tests for cookbook 12. No test creates a Meshy task."""

import importlib.util
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import requests
from manifold3d import Error, Manifold, Mesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("threadedknob", ROOT / "examples/12-image-to-threaded-knob/python/main.py")
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)

MODEL_PAYLOAD = {"ai_model": "meshy-7.1", "should_texture": False, "target_formats": ["stl"]}
REPORT = {"status": "healthy", "metrics": {"is_watertight": True, "non_manifold_edges": 0}, "thin_walls": {"thin_area_ratio": 0.04}}


def task(endpoint, task_id):
    if endpoint == "print/analyze":
        return {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 0, "printability": REPORT}
    return {"id": task_id, "status": "SUCCEEDED", "progress": 100, "consumed_credits": 20,
            "model_urls": {"stl": "https://example.invalid/model.stl?signature=private"},
            "thumbnail_url": "https://example.invalid/preview"}


def solid_from_stl(path):
    vertices, triangles = recipe.read_stl(path)
    return Manifold(Mesh(vert_properties=vertices, tri_verts=triangles))


def hole_radii(solid, z):
    """Smallest and largest distance from the axis to the hole wall in one horizontal slice."""
    contours = [np.asarray(c) for c in solid.slice(z).to_polygons()]
    hole = min(contours, key=lambda c: np.hypot(c[:, 0], c[:, 1]).max())
    radii = np.hypot(hole[:, 0], hole[:, 1])
    return radii.min(), radii.max()


class ThreadedKnobTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # A plain knob in Image to 3D's units: a stem under a wider cap, about 1.9 units across.
        cls.fixtures = tempfile.TemporaryDirectory()
        knob = Manifold.cylinder(1.0, 0.3, 0.3, 64) + Manifold.cylinder(0.6, 0.95, 0.95, 128).translate((0, 0, 1.0))
        cls.knob_stl = Path(cls.fixtures.name) / "knob.stl"
        recipe.write_stl(cls.knob_stl, knob.translate((0.2, -0.1, 0.05)))

    @classmethod
    def tearDownClass(cls):
        cls.fixtures.cleanup()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.client = MagicMock()
        self.client.create.side_effect = ["model-id", "check-1", "check-2"]
        self.client.wait.side_effect = lambda endpoint, task_id, label="": task(endpoint, task_id)
        self.client.download.side_effect = lambda url, dest: shutil.copy(self.knob_stl, dest) if "model.stl" in url else dest.write_bytes(b"png")

    def state(self, model="model-id", **changes):
        state = {"version": 1, "image": str(recipe.SAMPLE_IMAGE), "screw": "8-32", "model_task_id": model, "creating": None}
        state.update(changes)
        recipe.save_state(self.output / "run.json", state)
        return state

    def test_new_run_sends_the_model_and_both_checks_in_order(self):
        with patch("builtins.print") as print_output:
            recipe.run(output=self.output, client=self.client)
        (model_call, without_hole, finished) = self.client.create.call_args_list
        self.assertEqual(model_call.args[0], "image-to-3d")
        self.assertTrue(model_call.args[1].pop("image_url").startswith("data:image/png;base64,"))
        self.assertEqual(model_call.args[1], MODEL_PAYLOAD)
        for call in (without_hole, finished):
            endpoint, payload = call.args
            self.assertEqual(endpoint, "print/analyze")
            self.assertTrue(payload.pop("model_url").startswith("data:model/gltf-binary;base64,Z2xURg"))
            self.assertEqual(payload, {"printer_type": "fdm", "intended_print_height_mm": 32.0})
        downloads = [call.args[1].name for call in self.client.download.call_args_list]
        self.assertEqual(downloads, ["model.stl", "model-thumbnail.png"])
        self.assertEqual(sorted(p.name for p in self.output.iterdir()), ["knob-8-32.stl", "model-thumbnail.png", "model.stl", "printability-8-32.json", "run.json"])
        self.assertEqual(json.loads((self.output / "printability-8-32.json").read_text()), {"without_hole": REPORT, "finished": REPORT})
        self.assertIn("20 credits total", print_output.call_args.args[0])
        state_text = (self.output / "run.json").read_text()
        self.assertEqual(json.loads(state_text), {"version": 1, "image": str(recipe.SAMPLE_IMAGE), "screw": "8-32", "model_task_id": "model-id", "creating": None})
        self.assertNotIn("https", state_text)

    def test_a_check_that_cannot_measure_thin_walls_still_saves_both_reports(self):
        unmeasured = {**REPORT, "thin_walls": {"thin_area_ratio": None}}
        self.client.wait.side_effect = lambda endpoint, task_id, label="": (
            {**task(endpoint, task_id), "printability": unmeasured} if endpoint == "print/analyze" else task(endpoint, task_id))
        with patch("builtins.print") as print_output:
            recipe.run(output=self.output, client=self.client)
        self.assertEqual(json.loads((self.output / "printability-8-32.json").read_text()), {"without_hole": unmeasured, "finished": unmeasured})
        self.assertTrue(any("thin walls unmeasured" in str(call.args[0]) for call in print_output.call_args_list))

    def test_knob_is_sized_and_threaded_for_each_screw(self):
        expected = {"8-32": (1.804, 2.233, 0.794), "M4": (1.771, 2.150, 0.700)}
        for screw, (inner, outer, pitch) in expected.items():
            with self.subTest(screw=screw):
                output = self.output / screw
                self.client.create.side_effect = ["model-id", "check-1", "check-2"]
                with patch("builtins.print"):
                    recipe.run(screw=screw.lower(), output=output, client=self.client)
                knob = solid_from_stl(output / f"knob-{screw}.stl")
                self.assertEqual(knob.status(), Error.NoError)
                x0, y0, z0, x1, y1, z1 = knob.bounding_box()
                self.assertAlmostEqual(x1 - x0, 38.0, places=3)
                self.assertAlmostEqual(z0, 0.0, places=5)
                self.assertAlmostEqual(z1, 32.0, places=3)
                self.assertAlmostEqual((x0 + x1) / 2, 0.0, places=3)
                low, high = hole_radii(knob, 6.0)
                self.assertAlmostEqual(low, inner, delta=0.01)
                self.assertAlmostEqual(high, outer, delta=0.01)
                self.assertAlmostEqual(hole_radii(knob, 0.5)[1], 2.6, delta=0.01)  # the counterbore
                self.assertAlmostEqual(recipe.SCREWS[screw][1], pitch, places=3)

    def test_thread_turns_one_pitch_per_revolution_to_the_right(self):
        cutter = recipe.thread_cutter("M4")
        def radius_at(z, degrees):
            hits = cutter.slice(z).to_polygons()
            points = np.concatenate([np.asarray(c) for c in hits])
            angles = np.degrees(np.arctan2(points[:, 1], points[:, 0])) % 360
            return np.hypot(points[:, 0], points[:, 1])[np.argmin(np.abs(angles - degrees))]
        profile = [radius_at(5 + k * 0.7 / 16, 0) for k in range(16)]
        quarter_turn = [radius_at(5 + 0.7 / 4 + k * 0.7 / 16, 90) for k in range(16)]
        self.assertTrue(np.allclose(profile, quarter_turn, atol=0.02))  # a right-hand thread rises a quarter pitch per quarter turn
        self.assertTrue(np.allclose(profile, [radius_at(5.7 + k * 0.7 / 16, 0) for k in range(16)], atol=0.02))

    def test_close_gaps_repairs_a_stray_triangle(self):
        cube = Manifold.cube((1, 1, 1)).to_mesh()
        vertices = np.array(cube.vert_properties, dtype=np.float32)
        triangles = np.array(cube.tri_verts, dtype=np.uint32)
        broken = np.concatenate([triangles, triangles[:1]])  # one triangle twice: three edges shared by three triangles
        self.assertEqual(Manifold(Mesh(vert_properties=vertices, tri_verts=broken)).status(), Error.NotManifold)
        fixed_vertices, fixed_triangles, removed = recipe.close_gaps(vertices, broken)
        self.assertEqual(removed, 5)
        fixed = Manifold(Mesh(vert_properties=fixed_vertices, tri_verts=fixed_triangles))
        self.assertEqual(fixed.status(), Error.NoError)
        self.assertEqual(fixed.genus(), 0)
        self.assertEqual(recipe.close_gaps(vertices, triangles)[2], 0)

    def test_resume_with_another_screw_recuts_without_creating_a_model(self):
        self.state(image="/missing/knob.png")
        self.client.create.side_effect = ["check-1", "check-2"]
        with patch("builtins.print") as print_output:
            recipe.run("M4", resume=True, output=self.output, client=self.client)
        self.assertEqual([call.args[0] for call in self.client.create.call_args_list], ["print/analyze", "print/analyze"])
        self.assertTrue((self.output / "knob-M4.stl").exists())
        self.assertEqual(json.loads((self.output / "run.json").read_text())["screw"], "M4")
        self.assertIn("model stage excluded", print_output.call_args.args[0])

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

    def test_refused_model_request_clears_the_marker_and_resume_retries(self):
        self.client.create.side_effect = recipe.MeshyAPIError(402, "Insufficient credits")
        with self.assertRaises(recipe.MeshyAPIError):
            recipe.run(output=self.output, client=self.client)
        state = json.loads((self.output / "run.json").read_text())
        self.assertEqual((state["model_task_id"], state["creating"]), (None, None))
        self.client.create.side_effect = ["model-id", "check-1", "check-2"]
        with patch("builtins.print"):
            recipe.run(resume=True, output=self.output, client=self.client)
        self.assertEqual(self.client.create.call_args_list[1].args[0], "image-to-3d")

    def test_invalid_state_inputs_and_new_run_rejected_before_client(self):
        cases = [{"version": True}, {"image": ""}, {"screw": "M5"}, {"screw": None}, {"model_task_id": "bad/id"}, {"creating": "check"}, {"extra": "secret"}]
        with patch.object(recipe, "Meshy") as constructor:
            for changes in cases:
                self.state(**changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    recipe.run(resume=True, output=self.output)
            self.state()
            with self.assertRaisesRegex(ValueError, "Image differs"):
                recipe.run(None, "other.png", resume=True, output=self.output)
            with self.assertRaisesRegex(ValueError, "already exists"):
                recipe.run(output=self.output)
            constructor.assert_not_called()

    def test_bad_inputs_fail_before_client_and_checkpoint(self):
        cases = [(None, "missing.png", "does not exist"), (None, "wrong.gif", "PNG, JPEG or WebP"), ("M5", None, "8-32 or M4"), ("8/32", None, "8-32 or M4")]
        for screw, image, message in cases:
            with self.subTest(image=image, screw=screw), patch.object(recipe, "Meshy", wraps=recipe.Meshy) as constructor:
                with self.assertRaisesRegex(ValueError, message):
                    recipe.run(screw, image, output=self.output)
                constructor.assert_not_called()
            self.assertFalse((self.output / "run.json").exists())

    def test_glb_is_y_up_in_millimetres(self):
        uri = recipe.glb_data_uri(Manifold.cube((10, 20, 30)))
        import base64
        data = base64.b64decode(uri.split(",", 1)[1])
        gltf = json.loads(data[20:20 + int.from_bytes(data[12:16], "little")])
        self.assertEqual(data[:4], b"glTF")
        self.assertEqual(int.from_bytes(data[8:12], "little"), len(data))
        self.assertEqual(gltf["accessors"][0]["max"], [10.0, 30.0, 0.0])
        self.assertEqual(gltf["accessors"][0]["min"], [0.0, 0.0, -20.0])


if __name__ == "__main__":
    unittest.main()
