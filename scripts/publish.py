#!/usr/bin/env python3
"""Validate canonical recipes and export content for a separate cookbook site.

Never imports a runner or calls Meshy. See scripts/README.md for the export contract.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/meshy-dev/meshy-cookbook"
SCHEMA_VERSION = 1
MARKDOWN = MarkdownIt("commonmark", {"html": True})
BLOCKED_PARTS = {"output", "node_modules", "__pycache__", ".git", ".venv", "venv", "dist"}


class ValidationError(ValueError):
    """A source file is unsafe, missing, malformed, or inconsistent."""


class UniqueLoader(yaml.SafeLoader):
    """Reject duplicate YAML keys instead of silently replacing metadata."""


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise ValidationError(f"Invalid or duplicate YAML key: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


@dataclass
class Recipe:
    directory: Path
    metadata: dict
    files: set[Path]
    links: dict[Path, list[tuple[str, Path]]]


def public_path(path: Path, root: Path) -> Path:
    """Check containment, secret/runtime exclusions, and symlinks before reading."""
    root = root.resolve()
    absolute = Path(os.path.abspath(path))
    try:
        relative = absolute.relative_to(root)
        resolved = absolute.resolve(strict=True)
        resolved.relative_to(root)
    except (ValueError, OSError, RuntimeError) as error:
        raise ValidationError(f"Missing file or path outside repository: {path}") from error
    if any(part in BLOCKED_PARTS for part in relative.parts):
        raise ValidationError(f"Runtime/private path cannot be published: {relative}")
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValidationError(f"Symlinks cannot be published: {relative}")
        if part.startswith(".") and part != ".env.example":
            raise ValidationError(f"Hidden/private path cannot be published: {relative}")
    if absolute.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
        raise ValidationError(f"Credential file cannot be published: {relative}")
    return resolved


def listed_file(root: Path, base: Path, value: str) -> Path:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or "\\" in value:
        raise ValidationError(f"Metadata paths must be plain relative paths: {value}")
    if PurePosixPath(value).is_absolute() or ".." in PurePosixPath(value).parts:
        raise ValidationError(f"Metadata path traversal is not allowed: {value}")
    result = public_path(base / value, root)
    if not result.is_file():
        raise ValidationError(f"Expected a file: {value}")
    if result.name == ".env.example":
        # The published example is deliberately a template, never a copied live env.
        text = result.read_text(encoding="utf-8")
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, separator, val = line.partition("=")
            if key.strip() != "MESHY_API_KEY" or not separator or val.strip().lower() not in {
                "", "your_api_key", "your_api_key_here", "your-meshy-api-key", "your_key_here"
            }:
                raise ValidationError(f".env.example must contain only a placeholder: {result}")
    return result


def validate_schema(data: object, root: Path, name: str, source: Path) -> None:
    schema = json.loads((root / "schemas" / name).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(data), key=lambda error: str(error.path))
    if errors:
        error = errors[0]
        location = ".".join(str(part) for part in error.path) or "<root>"
        raise ValidationError(f"{source}: {location}: {error.message}")


class HTMLLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and key in {"src", "href", "poster"}:
                self.links.append(value)


def markdown_links(text: str) -> list[str]:
    """Use a Markdown parser so links in code blocks are not mistaken for links."""
    result = []
    for token in MARKDOWN.parse(text):
        for child in [token, *(token.children or [])]:
            if child.type == "link_open":
                result.append(child.attrGet("href"))
            elif child.type == "image":
                result.append(child.attrGet("src"))
            elif child.type in {"html_inline", "html_block"}:
                parser = HTMLLinks()
                parser.feed(child.content)
                result.extend(parser.links)
    return list(dict.fromkeys(result))


def heading_ids(text: str) -> set[str]:
    """GitHub-style identifiers for the plain headings used by these recipes."""
    identifiers = set()
    counts = {}
    tokens = MARKDOWN.parse(text)
    for index, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        heading = tokens[index + 1]
        plain = "".join(child.content for child in heading.children or [] if child.type in {"text", "code_inline"})
        slug = re.sub(r"[^\w\- ]", "", plain.lower()).replace(" ", "-")
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        identifiers.add(slug if count == 0 else f"{slug}-{count}")
    # Explicit anchors used in ordinary HTML are valid too.
    identifiers.update(re.findall(r'\bid=["\']([^"\']+)["\']', text))
    return identifiers


def check_markdown(root: Path, source: Path) -> list[tuple[str, Path]]:
    text = source.read_text(encoding="utf-8")
    resolved = []
    for destination in markdown_links(text):
        parsed = urlsplit(destination)
        if parsed.scheme or parsed.netloc:
            continue  # Default validation is intentionally offline.
        decoded = unquote(parsed.path)
        if decoded.startswith("/") or "\\" in decoded:
            raise ValidationError(f"{source}: local links must be repository-relative: {destination}")
        target = public_path(source.parent / decoded if decoded else source, root)
        if target.is_dir():
            target = public_path(target / "README.md", root)
        if not target.is_file():
            raise ValidationError(f"{source}: broken link: {destination}")
        if parsed.fragment and target.suffix.lower() == ".md":
            if unquote(parsed.fragment) not in heading_ids(target.read_text(encoding="utf-8")):
                raise ValidationError(f"{source}: missing Markdown heading: {destination}")
        resolved.append((destination, target))
    return resolved


def check_python_snippets(readme: Path, entrypoint: Path) -> None:
    """Every fenced Python statement must occur in the runnable source AST."""
    try:
        runner = ast.parse(entrypoint.read_text(encoding="utf-8"))
        statements = {ast.dump(node, include_attributes=False) for node in ast.walk(runner) if isinstance(node, ast.stmt)}
        for token in MARKDOWN.parse(readme.read_text(encoding="utf-8")):
            if token.type != "fence" or token.info.strip() != "python":
                continue
            for statement in ast.parse(token.content).body:
                if ast.dump(statement, include_attributes=False) not in statements:
                    line = (token.map or [0])[0] + 1
                    raise ValidationError(f"{readme}:{line}: Python snippet differs from {entrypoint}")
    except SyntaxError as error:
        raise ValidationError(f"Python syntax error in {readme} or {entrypoint}: {error}") from error


def load_recipes(root: Path = ROOT) -> list[Recipe]:
    root = root.resolve()
    paths = sorted((root / "examples").glob("*/recipe.yaml"))
    if not paths:
        raise ValidationError("No examples/*/recipe.yaml files found")
    recipes = []
    slugs, orders = set(), set()
    for path in paths:
        public_path(path, root)
        try:
            metadata = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueLoader)
        except yaml.YAMLError as error:
            raise ValidationError(f"{path}: invalid YAML: {error}") from error
        validate_schema(metadata, root, "recipe.schema.json", path)
        if metadata["slug"] in slugs or metadata["order"] in orders:
            raise ValidationError(f"{path}: recipe slug and order must each be unique")
        slugs.add(metadata["slug"])
        orders.add(metadata["order"])
        estimate = metadata["estimates"]["time_seconds"]
        if estimate["min"] > estimate["max"]:
            raise ValidationError(f"{path}: minimum estimated time exceeds maximum")
        directory = path.parent.resolve()
        recipe_files = [metadata["readme"], metadata["sample_result"], *metadata["input"]["files"], *metadata["assets"]]
        recipe_files.extend(preview["path"] for preview in metadata["previews"])
        files = {path.resolve()}
        for language, configuration in metadata["languages"].items():
            required = {"python": {"python/main.py", "python/requirements.txt", "python/.env.example"},
                        "typescript": {"typescript/main.ts", "typescript/package.json", "typescript/tsconfig.json", "typescript/.env.example"}}[language]
            if not required.issubset(configuration["files"]) or configuration["entrypoint"] not in configuration["files"]:
                raise ValidationError(f"{path}: {language} files must include entrypoint, dependencies, config and .env.example")
            if not all(value.startswith(language + "/") for value in configuration["files"]):
                raise ValidationError(f"{path}: {language} files must be in its language directory")
            recipe_files.extend(configuration["files"])
            for value in configuration["shared"]:
                if not value.startswith(f"shared/{language}/"):
                    raise ValidationError(f"{path}: shared clients must be in shared/{language}/")
                files.add(listed_file(root, root, value))
        files.update(listed_file(root, directory, value) for value in recipe_files)
        for source in files:
            if source.suffix == ".py":
                try:
                    ast.parse(source.read_text(encoding="utf-8"))
                except SyntaxError as error:
                    raise ValidationError(f"{source}: {error}") from error
        sample_path = directory / metadata["sample_result"]
        try:
            sample = json.loads(sample_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValidationError(f"{sample_path}: invalid JSON: {error}") from error
        validate_schema(sample, root, "sample-result.schema.json", sample_path)
        if sample["slug"] != metadata["slug"] or sample["historical_run"]["documented_on"] != metadata["last_verified"]:
            raise ValidationError(f"{sample_path}: slug/date must match recipe metadata")
        links = {source: check_markdown(root, source) for source in sorted(files) if source.suffix == ".md"}
        check_python_snippets(directory / metadata["readme"], directory / metadata["languages"]["python"]["entrypoint"])
        recipes.append(Recipe(directory, metadata, files, links))
    # Inputs and previews referenced by Markdown must be listed, so they cannot be
    # silently omitted from an otherwise successful export.
    published = {path for recipe in recipes for path in recipe.files}
    for recipe in recipes:
        for source, links in recipe.links.items():
            for destination, target in links:
                if target.is_relative_to(root / "examples") and target not in published:
                    raise ValidationError(f"{source}: linked recipe file is not listed in metadata: {destination}")
    for value in ["README.md", "CONTRIBUTING.md", "scripts/README.md"]:
        if (root / value).is_file():
            check_markdown(root, root / value)
    return sorted(recipes, key=lambda recipe: recipe.metadata["order"])


def source_provenance(root: Path, require_clean: bool = False) -> dict:
    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout.strip()
    try:
        commit = git("rev-parse", "HEAD")
        dirty = bool(git("status", "--porcelain", "--untracked-files=normal"))
    except (OSError, subprocess.CalledProcessError) as error:
        if require_clean:
            raise ValidationError("A clean Git checkout with a commit is required for publication") from error
        commit, dirty = None, None
    if require_clean and dirty:
        raise ValidationError("Publication requires a clean Git checkout; commit or remove local changes first")
    return {"repository": REPOSITORY, "commit": commit, "dirty": dirty}


def export_path(root: Path, path: Path, recipes: list[Recipe]) -> str:
    for recipe in recipes:
        if path.is_relative_to(recipe.directory):
            return f"recipes/{recipe.metadata['slug']}/{path.relative_to(recipe.directory).as_posix()}"
    return path.relative_to(root).as_posix()


def json_bytes(data) -> bytes:
    return (json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def write_zip(path: Path, members: dict[str, bytes]) -> None:
    """Stable order, timestamps, and permissions make repeat builds reproducible."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(members.items()):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)


def build(root: Path = ROOT, output: Path | None = None, require_clean: bool = False) -> dict:
    root = root.resolve()
    output = (output or root / "dist").absolute()
    # Never replace the checkout or a source directory. Rebuild only an empty
    # directory or an output explicitly marked as ours.
    if output.is_symlink() or root == output.resolve() or root.is_relative_to(output.resolve()):
        raise ValidationError("Output must be a separate directory, not the repository or its ancestor")
    if output.resolve().is_relative_to(root) and output.relative_to(root).parts[0] != "dist":
        raise ValidationError("In-repository output must be dist/ (or a directory inside dist/)")
    marker = output / ".meshy-cookbook-export"
    if output.exists() and any(output.iterdir()) and not marker.is_file():
        raise ValidationError(f"Refusing to replace unrecognized nonempty output directory: {output}")
    recipes = load_recipes(root)
    provenance = source_provenance(root, require_clean)
    catalog = {"schema_version": SCHEMA_VERSION, "source": provenance, "recipes": []}
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".cookbook-export-", dir=output.parent))
    try:
        published = {path for recipe in recipes for path in recipe.files}
        for recipe in recipes:
            slug = recipe.metadata["slug"]
            members = {}
            for source in sorted(recipe.files):
                data = source.read_bytes()
                target = staging / export_path(root, source, recipes)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                members[source.relative_to(root).as_posix()] = data
            links = []
            for source, destinations in sorted(recipe.links.items()):
                for original, target in destinations:
                    parsed = urlsplit(original)
                    mapped = {"from": export_path(root, source, recipes), "original": original,
                              "source_path": target.relative_to(root).as_posix(),
                              "fragment": parsed.fragment, "query": parsed.query}
                    if target in published:
                        mapped["export_path"] = export_path(root, target, recipes)
                        owner = next((item for item in recipes if target == item.directory / item.metadata["readme"]), None)
                        if owner:
                            mapped["page_slug"] = owner.metadata["slug"]
                    else:
                        ref = provenance["commit"] or "main"
                        mapped["repository_url"] = f"{REPOSITORY}/blob/{ref}/{quote(target.relative_to(root).as_posix())}"
                    links.append(mapped)
            # Generated bundle root keeps the repository layout used by imports.
            members["README.md"] = (
                f"# {recipe.metadata['title']}\n\n"
                f"Open [{recipe.metadata['title']}]({recipe.directory.relative_to(root).as_posix()}/README.md) for setup and usage.\n\n"
                f"Run commands from the extracted folder, keeping `examples/` and `shared/` together. "
                f"Dependencies and `.env.example` are included for both languages. Live generation spends Meshy credits.\n\n"
                "Skip the tutorial's clone step when using this extracted download.\n\n"
                f"Source: {REPOSITORY}\n\n"
                "Links to other recipes lead to the full repository; this download includes only the selected recipe.\n"
            ).encode("utf-8")
            members["package.json"] = json_bytes({"private": True, "type": "module"})
            members["SOURCE.json"] = json_bytes(provenance)
            members["AGENTS.md"] = (
                "# Using this Meshy cookbook example\n\n"
                f"Read `{recipe.directory.relative_to(root).as_posix()}/README.md`, the selected language's main file, "
                "and its shared client before adapting or running the recipe.\n\n"
                f"A live run spends approximately {recipe.metadata['estimates']['credits']} Meshy credits. "
                "Tell the user the cost and wait for approval unless already given.\n\n"
                "Read MESHY_API_KEY from the environment or a local .env. Never write it into code, "
                "ask for it in chat, or put API calls in browser code. Keep the sample defaults and "
                "pass custom inputs as positional arguments. Use the user's project language, or Python by default. "
                "When adapting the recipe, copy the full shared client and retain its error handling.\n"
            ).encode("utf-8")
            for optional in ["LICENSE", "LICENSE.md"]:
                if (root / optional).is_file():
                    members[optional] = public_path(root / optional, root).read_bytes()
            # Replace cross-recipe Markdown links in the downloadable README with
            # source links; its own input/source/asset links stay local.
            for source, destinations in recipe.links.items():
                name = source.relative_to(root).as_posix()
                text = members[name].decode("utf-8")
                for original, target in destinations:
                    if target.relative_to(root).as_posix() not in members:
                        ref = provenance["commit"] or "main"
                        parsed = urlsplit(original)
                        url = f"{REPOSITORY}/blob/{ref}/{quote(target.relative_to(root).as_posix())}"
                        if parsed.fragment:
                            url += "#" + parsed.fragment
                        # Exact destinations only, including reference/HTML links.
                        text = text.replace(f"]({original})", f"]({url})").replace(f'="{original}"', f'="{url}"')
                        text = re.sub(r"(?m)^(\s*\[[^\]]+\]:\s*)" + re.escape(original) + r"(?=\s|$)", lambda match: match.group(1) + url, text)
                members[name] = text.encode("utf-8")
            bundle_path = f"downloads/{slug}.zip"
            write_zip(staging / bundle_path, members)
            entry = dict(recipe.metadata)
            entry["source_directory"] = recipe.directory.relative_to(root).as_posix()
            entry["markdown"] = export_path(root, recipe.directory / recipe.metadata["readme"], recipes)
            entry["download"] = bundle_path
            entry["resolved_links"] = links
            entry["files"] = [{"source_path": source.relative_to(root).as_posix(),
                               "export_path": export_path(root, source, recipes),
                               "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
                              for source in sorted(recipe.files)]
            catalog["recipes"].append(entry)
        (staging / "catalog.json").write_bytes(json_bytes(catalog))
        (staging / ".meshy-cookbook-export").write_text("1\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        staging.rename(output)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return catalog


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "build"])
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--require-clean", action="store_true", help="Require a clean Git commit for a release export")
    args = parser.parse_args()
    try:
        if args.command == "validate":
            recipes = load_recipes()
            if args.require_clean:
                source_provenance(ROOT, True)
            print(f"Validated {len(recipes)} recipes (offline; no Meshy calls).")
        else:
            catalog = build(output=args.output, require_clean=args.require_clean)
            print(f"Exported {len(catalog['recipes'])} recipes to {args.output.resolve()}")
    except (ValidationError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
