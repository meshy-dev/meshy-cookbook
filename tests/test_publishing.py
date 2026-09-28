"""Publishing tests use curated source fixtures, never ignored runtime models."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

import yaml

from scripts import publish


class PublishingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = publish.ROOT
        cls.recipes = publish.load_recipes(cls.source)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve() / "repo"
        self.root.mkdir()
        shutil.copytree(self.source / "schemas", self.root / "schemas")
        for recipe in self.recipes:
            for path in recipe.files:
                target = self.root / path.relative_to(self.source)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        (self.root / "README.md").write_text("# Fixture\n")
        (self.root / ".gitignore").write_text(".env\noutput/\nnode_modules/\ndist/\n")
        self.directory = self.root / "examples/01-image-to-3d-character"
        self.metadata_path = self.directory / "recipe.yaml"
        self.output = Path(self.temporary.name).resolve() / "export"

    def change_metadata(self, update):
        data = yaml.safe_load(self.metadata_path.read_text())
        update(data)
        self.metadata_path.write_text(yaml.safe_dump(data, sort_keys=False))

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True, text=True).stdout.strip()

    def commit_fixture(self):
        self.git("init", "-q")
        self.git("add", ".")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture")

    def test_validation_needs_no_runtime_output(self):
        self.assertFalse(list(self.root.glob("examples/*/*/output")))
        self.assertEqual(len(publish.load_recipes(self.root)), 11)

    def test_metadata_requires_valid_types_and_dates(self):
        self.change_metadata(lambda data: data.update(last_verified="not-a-date"))
        with self.assertRaisesRegex(publish.ValidationError, "last_verified"):
            publish.load_recipes(self.root)

    def test_duplicate_yaml_keys_are_rejected(self):
        with self.metadata_path.open("a") as stream:
            stream.write("slug: overridden\n")
        with self.assertRaisesRegex(publish.ValidationError, "duplicate YAML"):
            publish.load_recipes(self.root)

    def test_missing_preview_fails_before_export(self):
        (self.directory / "assets/result.png").unlink()
        with self.assertRaisesRegex(publish.ValidationError, "Missing file"):
            publish.build(self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_metadata_path_traversal_and_private_paths_are_rejected(self):
        self.change_metadata(lambda data: data["assets"].append("../../README.md"))
        with self.assertRaises(publish.ValidationError):
            publish.load_recipes(self.root)
        self.change_metadata(lambda data: data.update(assets=["python/.env"]))
        (self.directory / "python/.env").write_text("MESHY_API_KEY=fixture-secret\n")
        with self.assertRaisesRegex(publish.ValidationError, "private"):
            publish.load_recipes(self.root)

    def test_internal_symlink_cannot_be_a_markdown_asset(self):
        (self.directory / "input/alias.png").symlink_to("concept-art.png")
        with (self.directory / "README.md").open("a") as stream:
            stream.write("\n![Alias](input/alias.png)\n")
        with self.assertRaisesRegex(publish.ValidationError, "Symlinks"):
            publish.load_recipes(self.root)

    def test_broken_reference_link_and_heading_are_detected(self):
        readme = self.directory / "README.md"
        original = readme.read_text()
        readme.write_text(original + "\n[Missing][bad]\n\n[bad]: input/missing.png\n")
        with self.assertRaisesRegex(publish.ValidationError, "Missing file"):
            publish.load_recipes(self.root)
        readme.write_text(original + "\n[Missing heading](#does-not-exist)\n")
        with self.assertRaisesRegex(publish.ValidationError, "missing Markdown heading"):
            publish.load_recipes(self.root)

    def test_python_snippet_drift_is_detected(self):
        readme = self.directory / "README.md"
        readme.write_text(readme.read_text().replace('"should_texture": True,', '"should_texture": False,'))
        with self.assertRaisesRegex(publish.ValidationError, "Python snippet differs"):
            publish.load_recipes(self.root)

    def test_export_resolves_links_and_bundles_only_explicit_public_files(self):
        (self.root / ".env").write_text("MESHY_API_KEY=fixture-secret\n")
        (self.directory / "python/.env").write_text("MESHY_API_KEY=fixture-secret\n")
        output = self.directory / "python/output"
        output.mkdir()
        (output / "run.json").write_text('{"token":"fixture-secret"}')
        (output / "model.glb").write_bytes(b"fixture-secret")
        (self.directory / "input/unlisted.txt").write_text("fixture-secret")
        catalog = publish.build(self.root, self.output)
        recipe = catalog["recipes"][0]
        mapped = next(link for link in recipe["resolved_links"] if link["original"] == "../02-image-to-low-poly-prop/")
        self.assertEqual(mapped["page_slug"], "image-to-low-poly-prop")
        self.assertTrue((self.output / mapped["export_path"]).is_file())
        code = self.output / "recipes/image-to-3d-character/python/main.py"
        self.assertEqual(code.read_bytes(), (self.directory / "python/main.py").read_bytes())
        with zipfile.ZipFile(self.output / recipe["download"]) as bundle:
            names = bundle.namelist()
            self.assertIn("shared/python/meshy.py", names)
            self.assertIn("shared/typescript/meshy.ts", names)
            self.assertIn("examples/01-image-to-3d-character/python/.env.example", names)
            self.assertIn("examples/01-image-to-3d-character/typescript/package.json", names)
            self.assertNotIn("examples/01-image-to-3d-character/input/unlisted.txt", names)
            self.assertFalse(any("/output/" in name or name.endswith("/.env") for name in names))
            self.assertFalse(any(b"fixture-secret" in bundle.read(name) for name in names))
            self.assertEqual(json.loads(bundle.read("package.json"))["type"], "module")
            article = bundle.read("examples/01-image-to-3d-character/README.md").decode()
            self.assertIn(publish.REPOSITORY + "/blob/main/examples/02-image-to-low-poly-prop/README.md", article)
            self.assertNotIn("](../02-image-to-low-poly-prop/)", article)

    def test_repeated_exports_and_zips_are_byte_identical(self):
        publish.build(self.root, self.output)
        first = {path.relative_to(self.output): path.read_bytes() for path in self.output.rglob("*") if path.is_file()}
        publish.build(self.root, self.output)
        second = {path.relative_to(self.output): path.read_bytes() for path in self.output.rglob("*") if path.is_file()}
        self.assertEqual(first, second)

    def test_provenance_and_clean_release_requirement(self):
        with self.assertRaisesRegex(publish.ValidationError, "clean Git checkout"):
            publish.build(self.root, self.output, require_clean=True)
        self.commit_fixture()
        catalog = publish.build(self.root, self.output, require_clean=True)
        self.assertEqual(catalog["source"]["commit"], self.git("rev-parse", "HEAD"))
        self.assertIs(catalog["source"]["dirty"], False)
        (self.root / "README.md").write_text("# Changed\n")
        self.assertIs(publish.source_provenance(self.root)["dirty"], True)
        with self.assertRaisesRegex(publish.ValidationError, "clean Git checkout"):
            publish.build(self.root, self.output, require_clean=True)

    def test_unrecognized_output_is_not_deleted(self):
        self.output.mkdir()
        keep = self.output / "important.txt"
        keep.write_text("keep")
        with self.assertRaisesRegex(publish.ValidationError, "Refusing to replace"):
            publish.build(self.root, self.output)
        self.assertEqual(keep.read_text(), "keep")


if __name__ == "__main__":
    unittest.main()
