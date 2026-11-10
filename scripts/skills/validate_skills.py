#!/usr/bin/env python3
"""CI validation for the self-contained Meshy agent skills in skills/.

Five checks:
  1. Frontmatter: each SKILL.md has a matching name, semver metadata.version,
     and a description with a trigger phrase and routing boundary.
  2. Version sync: every skill version matches the latest versioned entry
     in skills/CHANGELOG.md.
  3. Reference bidirectionality: local links resolve and every supporting
     markdown file is reachable from SKILL.md.
  4. No links outside a skill's directory, so it is independently installable.
  5. Every bundled check_prompt.py matches scripts/skills/check_prompt.py.

Exits 0 when all checks pass, 1 otherwise. Emits ::error annotations in CI.
Local run: python3 scripts/skills/validate_skills.py (requires pyyaml).
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = ROOT / "skills"
CHANGELOG = SKILLS_DIR / "CHANGELOG.md"
CHECKER_MASTER = Path(__file__).resolve().parent / "check_prompt.py"

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
TRIGGER_RE = re.compile(r"use\s+(?:this\s+skill\s+)?when", re.IGNORECASE)
BOUNDARY_RE = re.compile(
    r"\b(?:instead|not\s+for|do\s+not\s+use|don'?t\s+use|only\s+(?:for|when)|except)\b",
    re.IGNORECASE,
)
MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
CHANGELOG_VER_RE = re.compile(r"^##\s+\[(\d+\.\d+\.\d+)\]", re.MULTILINE)
EXTERNAL_LINK_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")

IN_CI = os.environ.get("GITHUB_ACTIONS") == "true"


def rel(path: Path) -> str:
    return str(Path(path).resolve().relative_to(ROOT))


def skill_dirs() -> list[Path]:
    if not SKILLS_DIR.is_dir():
        return []
    return sorted(
        d for d in SKILLS_DIR.iterdir() if d.is_dir() and (d / "SKILL.md").is_file()
    )


def load_frontmatter(path: Path):
    match = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None


def md_link_targets(text: str) -> list[str]:
    targets = []
    # Code examples such as mapping["fn"]("arg") are not Markdown links.
    prose = re.sub(r"```.*?```|`[^`\n]*`", "", text, flags=re.S)
    for match in MD_LINK_RE.finditer(prose):
        target = match.group(1).strip()
        if target.startswith("<"):
            end = target.find(">")
            target = target[1:end] if end != -1 else target[1:]
        else:
            target = target.split(" ")[0]  # drop optional "title"
        targets.append(target)
    return targets


def is_external(target: str) -> bool:
    return (
        bool(EXTERNAL_LINK_RE.match(target))
        or target.startswith("#")
        or target.startswith("//")
    )


# --- Check 1: frontmatter ----------------------------------------------------


def check_frontmatter() -> list[str]:
    errors = []
    if not skill_dirs():
        return [f"{rel(SKILLS_DIR)}: no skills found"]
    for directory in skill_dirs():
        path = directory / "SKILL.md"
        fm = load_frontmatter(path)
        if not isinstance(fm, dict):
            errors.append(f"{rel(path)}: missing or unparseable YAML frontmatter")
            continue
        name = fm.get("name")
        if name != directory.name:
            errors.append(
                f'{rel(path)}: frontmatter name "{name}" != directory name '
                f'"{directory.name}"'
            )
        metadata = fm.get("metadata")
        version = metadata.get("version") if isinstance(metadata, dict) else None
        if version is None:
            errors.append(f"{rel(path)}: metadata.version missing")
        elif not SEMVER_RE.match(str(version)):
            errors.append(
                f'{rel(path)}: metadata.version "{version}" is not semver x.y.z'
            )
        description = fm.get("description")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{rel(path)}: description missing or empty")
            continue
        if not TRIGGER_RE.search(description):
            errors.append(
                f'{rel(path)}: description lacks a trigger phrase '
                f'(expected "use when ...")'
            )
        if not BOUNDARY_RE.search(description):
            errors.append(
                f"{rel(path)}: description lacks a boundary note "
                f'(e.g. "use ... instead", "not for ...")'
            )
    return errors


# --- Check 2: version sync ---------------------------------------------------


def collect_versions() -> tuple[list[str], dict[str, str]]:
    errors: list[str] = []
    versions: dict[str, str] = {}

    for directory in skill_dirs():
        path = directory / "SKILL.md"
        fm = load_frontmatter(path)
        if (
            isinstance(fm, dict)
            and isinstance(fm.get("metadata"), dict)
            and fm["metadata"].get("version") is not None
        ):
            versions[f"{rel(path)} metadata.version"] = str(fm["metadata"]["version"])

    if CHANGELOG.is_file():
        match = CHANGELOG_VER_RE.search(CHANGELOG.read_text(encoding="utf-8"))
        if match:
            versions["CHANGELOG.md top entry"] = match.group(1)
        else:
            errors.append("CHANGELOG.md: no '## [x.y.z]' entry found")
    else:
        errors.append("CHANGELOG.md: missing")

    return errors, versions


def check_versions() -> list[str]:
    errors, versions = collect_versions()
    for label, value in sorted(versions.items()):
        if not SEMVER_RE.match(value):
            errors.append(f'{label}: "{value}" is not semver x.y.z')
    if len(set(versions.values())) > 1:
        detail = "\n    ".join(
            f"{label} = {value}" for label, value in sorted(versions.items())
        )
        errors.append(f"version mismatch across skills/CHANGELOG:\n    {detail}")
    return errors


# --- Check 5: identical prompt checkers ---------------------------------------


def check_checker_copies() -> list[str]:
    errors: list[str] = []
    if not CHECKER_MASTER.is_file():
        return [f"{rel(CHECKER_MASTER)}: missing"]
    master = CHECKER_MASTER.read_bytes()
    for directory in skill_dirs():
        copy = directory / "scripts" / "check_prompt.py"
        if copy.is_file() and copy.read_bytes() != master:
            errors.append(f"{rel(copy)}: differs from {rel(CHECKER_MASTER)}; copy the master over it")
    return errors


# --- Check 3: reference bidirectionality --------------------------------------


def check_references() -> list[str]:
    errors = []
    for directory in skill_dirs():
        root = directory.resolve()
        md_files = {p.resolve() for p in directory.rglob("*.md")}
        graph: dict[Path, set[Path]] = {p: set() for p in md_files}
        for path in md_files:
            for target in md_link_targets(path.read_text(encoding="utf-8")):
                if is_external(target):
                    continue
                target = target.split("#", 1)[0]
                if not target:
                    continue
                resolved = (path.parent / target).resolve()
                try:
                    resolved.relative_to(root)
                except ValueError:
                    continue  # escapes the skill dir; check 4 reports escapes
                if not resolved.exists():
                    errors.append(f"{rel(path)}: linked file '{target}' does not exist")
                elif resolved in md_files:
                    graph[path].add(resolved)
        start = (directory / "SKILL.md").resolve()
        seen: set[Path] = set()
        stack = [start]
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(graph.get(current, set()) - seen)
        for path in sorted(md_files - {start}):
            if path not in seen:
                errors.append(
                    f"{rel(path)}: not referenced by any markdown link chain "
                    f"from {rel(directory / 'SKILL.md')}"
                )
    return errors


# --- Check 4: no links outside the skill directory ----------------------------------


def check_no_parent_refs() -> list[str]:
    errors = []
    for directory in skill_dirs():
        root = directory.resolve()
        for path in directory.rglob("*.md"):
            for target in md_link_targets(path.read_text(encoding="utf-8")):
                if is_external(target):
                    continue
                bare = target.split("#", 1)[0]
                if not bare:
                    continue
                resolved = (path.parent / bare).resolve()
                try:
                    resolved.relative_to(root)
                except ValueError:
                    errors.append(
                        f"{rel(path)}: link '{target}' escapes the skill "
                        f"directory (skill directories must be independently "
                        f"installable)"
                    )
    return errors


# --- Runner --------------------------------------------------------------------


def main() -> int:
    checks = [
        ("Check 1/5: SKILL.md frontmatter", check_frontmatter()),
        ("Check 2/5: version sync", check_versions()),
        ("Check 3/5: reference bidirectionality", check_references()),
        ("Check 4/5: no links outside the skill directory", check_no_parent_refs()),
        ("Check 5/5: identical prompt checkers", check_checker_copies()),
    ]

    failed = 0
    for title, errors in checks:
        if errors:
            failed += 1
            print(f"FAIL {title}")
            for error in errors:
                print(f"    {error}")
                if IN_CI:
                    annotation = str(error).replace("\n", " -- ")
                    print(f"::error ::{annotation}")
        else:
            print(f"ok   {title}")

    if failed:
        print(f"\n{failed} of {len(checks)} checks FAILED")
        return 1
    print(f"\nAll {len(checks)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
