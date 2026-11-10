#!/usr/bin/env python3
"""Lint a Meshy prompt against the tested prompt formulas.

    python3 check_prompt.py --kind preview "A medieval knight's helmet, ..."
    python3 check_prompt.py --kind image --pose-mode a-pose "A stocky dwarf ..."
    python3 check_prompt.py --kind texture "Realistic medieval style. Rivets: brass. ..."
    python3 check_prompt.py --kind edit "Replace the horned helmet with ..."
    echo "..." | python3 check_prompt.py --kind preview

Kinds:
  preview  Text to 3D preview `prompt` (shape only)
  image    Text to Image / Image to Image `prompt` whose output feeds Image to 3D
  texture  `texture_prompt` (refine, Image to 3D) or `text_style_prompt` (Retexture)
  edit     Meshy Edit prompt (web app, after a lasso selection)

Prints ERROR / WARN / NOTE lines and exits 1 when there is an ERROR. Every
check is a word-list heuristic drawn from the live tests behind the skills;
a WARN is a question to answer, not a verdict. Standard library only.
"""

from __future__ import annotations

import argparse
import re
import sys

MAX_CHARS = 800

MATERIALS = (
    "wooden wood leather metal metallic iron steel brass bronze copper gold golden "
    "silver stone marble granite glass crystal wool cloth fabric linen silk velvet "
    "plastic rubber chrome ceramic porcelain clay fur obsidian ivory bone"
).split()
COLORS = (
    "red blue green yellow orange purple pink brown grey gray black white beige "
    "crimson teal navy maroon violet turquoise amber charcoal scarlet"
).split()
DAMAGE = (
    "dented dents dent scratched scratches scratch rust rusty rusted scuffed scuffs "
    "chipped cracked worn weathered battle-worn burn burns burnt soot scorched"
).split()
POSES_OTHER = [
    "sitting", "seated", "kneeling", "crouching", "running", "jumping", "walking",
    "hands on hips", "arms crossed", "arms folded", "waving", "pointing", "leaning",
    "lying", "flying", "fighting stance", "heroic pose",
]
POSES_AT = ["a-pose", "t-pose", "a pose", "t pose", "arms straight", "arms angled"]
LIGHTING = "lighting lit shadow shadows backlit spotlight rim-light".split()
THIN_DENSE = (
    "feather feathers plume plumes chain chains wire wires string strings lattice "
    "scaffolding cables netting mesh-like"
).split()
GROUND = [
    "foundation", "flower box", "flower boxes", "garden", "lawn", "yard", "fence",
    "path", "pathway", "ground", "terrain", "grass", "bushes", "hedge",
]
LOOK_STYLES = ["cartoon", "cartoonish", "toy", "toy-like"]
SHAPE_CHANGE = [
    "taller", "shorter", "wider", "thicker", "thinner", "bigger", "larger", "smaller",
    "longer", "add a", "add an", "remove the", "remove a", "reshape", "elongate",
    "enlarge", "shrink",
]
SIDE_WORDS = "left right front back top bottom upper lower rear".split()
PAIRED_PARTS = (
    "shoulder shoulders arm arms hand hands leg legs foot feet wing wings eye eyes ear ears "
    "horn horns boot boots glove gloves pauldron gauntlet knee elbow"
).split()
EDIT_VERBS = ("replace", "add", "make", "remove", "turn", "change", "give", "swap")


def words(text: str) -> list[str]:
    return re.findall(r"[a-z][a-z'-]*", text.lower())


def found(text: str, terms) -> list[str]:
    low = text.lower()
    hits = []
    for t in terms:
        if " " in t:
            if t in low:
                hits.append(t)
        elif re.search(r"(?<![a-z-])" + re.escape(t) + r"(?![a-z])", low):
            hits.append(t)
    return hits


def phrase_present(text: str, options) -> bool:
    low = text.lower()
    return any(o in low for o in options)


class Report:
    def __init__(self) -> None:
        self.lines: list[tuple[str, str]] = []

    def error(self, msg: str) -> None:
        self.lines.append(("ERROR", msg))

    def warn(self, msg: str) -> None:
        self.lines.append(("WARN", msg))

    def note(self, msg: str) -> None:
        self.lines.append(("NOTE", msg))

    def emit(self) -> int:
        errors = 0
        for level, msg in self.lines:
            print(f"{level}: {msg}")
            errors += level == "ERROR"
        if not self.lines:
            print("OK: no findings")
        return 1 if errors else 0


def common_checks(text: str, r: Report, max_chars: int) -> None:
    n = len(text)
    if n == 0:
        r.error("empty prompt")
    elif n > max_chars:
        r.error(f"{n} characters; the API caps this field at {max_chars} (400 error)")
    else:
        r.note(f"{n} of {max_chars} characters")


def check_preview(text: str, r: Report) -> None:
    low = text.lower()
    if hits := found(text, MATERIALS):
        r.warn(f"material words ({', '.join(hits)}): the preview has no texture; "
               "name the part, not its material, and keep the material for the texture prompt")
    if hits := found(text, COLORS):
        r.warn(f"color words ({', '.join(hits)}): colors belong in the refine's texture_prompt")
    if hits := found(text, DAMAGE):
        r.warn(f"surface damage ({', '.join(hits)}): the mesh came out smooth when asked for dents; "
               "describe damage in the texture prompt")
    if hits := found(text, POSES_AT + POSES_OTHER):
        r.warn(f"pose words ({', '.join(hits)}): Text to 3D gave no standard A-pose in 18 runs; "
               "set pose_mode for a statue, or use the image route for a rig-ready character")
    if re.search(r"low[- ]?poly", low):
        r.warn("'low-poly' changes the look, not the count; set target_polycount "
               "(with should_remesh, or model_type smart-topology + ai_model meshy-t2.5)")
    if re.search(r"\b\d[\d,]*\s*(faces|polys|polygons|tris|triangles)\b", low):
        r.warn("a face count in words is ignored; set target_polycount instead")
    if hits := found(text, LIGHTING + ["background"]):
        r.warn(f"lighting or background words ({', '.join(hits)}) mean nothing to a mesh generator")
    if hits := found(text, THIN_DENSE):
        r.warn(f"thin or dense parts ({', '.join(hits)}) are a common cause of failed generations; "
               "replace with solid shapes or leave out")
    if hits := found(text, GROUND):
        r.warn(f"ground-level details ({', '.join(hits)}): on a cottage they came with an added ring "
               "of bushes and rocks; leave them out unless the base is part of the asset")
    if hits := found(text, LOOK_STYLES):
        r.note(f"style words ({', '.join(hits)}): 'cartoon delivery van' gave a realistic van in 3 of 3 "
               "previews; if the look depends on the style, use the image route")
    if re.search(r"\bwindow panels?\b", low):
        r.note("'window panels' gave solid panels; write 'window openings' if they should be holes")
    details = [p for p in re.split(r"[,;]", text) if p.strip()]
    if len(details) > 9:
        r.warn(f"about {len(details)} comma-separated details; the preview dropped details "
               "from longer lists, so keep the eight that matter and put them first")
    if not phrase_present(low, ["single standalone object", "single standalone character"]):
        r.note("no closing phrase; end with 'single standalone object' or 'single standalone character'")
    first = low.split(",")[0]
    if len(first.split()) > 12:
        r.note("the subject should be the first few words; the opening clause is long")


def check_image(text: str, r: Report, pose_mode: str | None) -> None:
    low = text.lower()
    required = [
        (["full object", "full body", "full figure"], "framing ('full object' or 'full body')"),
        (["front view", "three-quarter"], "view ('front view' for characters, 'three-quarter front view' for props)"),
        (["centered"], "'centered with space around it'"),
        (["even studio lighting", "even lighting", "soft lighting", "studio lighting"], "'soft even studio lighting'"),
        (["plain white background", "white background", "plain background", "neutral background"], "'plain white background'"),
        (["single object", "single character", "single subject"], "'single object' or 'single character'"),
        (["no props"], "'no props'"),
        (["no text"], "'no text'"),
    ]
    for options, label in required:
        if not phrase_present(low, options):
            r.warn(f"missing {label}")
    if hits := found(text, THIN_DENSE):
        r.warn(f"thin or dense parts ({', '.join(hits)}) convert badly; leave them out")
    if hits := found(text, ["shadow", "shadows", "dramatic", "backlit", "rim light", "sunset", "moody"]):
        r.warn(f"lighting mood words ({', '.join(hits)}) get painted into the texture")
    at_words = found(text, POSES_AT)
    other_pose = found(text, POSES_OTHER)
    if pose_mode:
        if other_pose:
            r.error(f"pose_mode={pose_mode} conflicts with pose words ({', '.join(other_pose)}); "
                    "the test gave a blend of both poses plus an unwanted prop")
        if at_words:
            r.warn(f"pose_mode={pose_mode} plus A/T-pose words ({', '.join(at_words)}) added nothing "
                   "and drifted the style in testing; drop the words")
    elif at_words:
        r.note("A/T-pose written in words works, but pose_mode is shorter and leaves room for the subject")
    if "glass" in low and not found(text, ["frosted", "tinted", "stained", "opaque", "milky"]):
        r.note("Image to 3D makes no transparent material: clear glass panes came out as an open frame, "
               "a clear dome as opaque white; write 'frosted glass' if the panes should be there")
    if hits := found(text, ["transparent background"]):
        r.note("for a transparent image set remove_background: true rather than asking in the prompt")


def check_texture(text: str, r: Report) -> None:
    low = text.lower()
    if hits := found(text, SHAPE_CHANGE):
        r.warn(f"shape words ({', '.join(hits)}): texturing cannot change geometry; use Meshy Edit")
    if hits := found(text, LIGHTING + ["background"]):
        r.warn(f"lighting or background words ({', '.join(hits)}) get painted into the base color; "
               "set enable_pbr instead")
    slots = re.findall(r"(?:^|\.\s+)([A-Z][^.:]{1,60}):\s", text)
    if not slots:
        r.note("no 'Part: material, color' slots found; one slot per visible part places materials reliably")
    generic = sorted({c for c in COLORS if re.search(r"(?<![a-z-])" + c + r"(?![a-z])", low)})
    if generic:
        r.warn(f"generic color words ({', '.join(generic)}): 'brown' and 'dark brown' drifted "
               "to grey in testing while 'saddle-brown' held in 4 of 4 runs; name a hue where the shade matters")
    damage = found(text, ["burn", "burns", "burnt", "soot", "scorched", "charred", "smoke"])
    if damage and generic:
        r.warn(f"color-implying damage ({', '.join(damage)}) next to a generic color: "
               "'dark brown leather with small burn marks' came out charcoal; name the hue on that part")
    mats = sorted(set(found(text, MATERIALS)))
    if len(mats) > 4:
        r.warn(f"{len(mats)} materials ({', '.join(mats)}); Meshy's guide lists 'stone and wood and metal "
               "and glass' as too many; keep to three or four")
    if not found(text, ["matte", "satin", "glossy", "polished", "sheen", "finish"]):
        r.note("no finish words; end with the finish per material (matte, satin, glossy, polished)")
    if not found(text, ["wear", "worn", "weathered", "pristine", "new", "clean"]):
        r.note("no wear level; one sentence on wear keeps the model from inventing it")


def check_edit(text: str, r: Report) -> None:
    low = text.strip().lower()
    if not low.startswith(EDIT_VERBS):
        r.note("start with the verb: Replace / Add / Make / Remove")
    if re.search(r"\bit\b", low) and not re.search(r"\bthe [a-z]+ (blade|head|arm|shield|helmet|hand|leg|wing|shoulder|sword)", low):
        r.warn("'it' without a named part: 'make it thicker' was rewritten as 'make the whole knight stockier'; "
               "name the part")
    paired = found(text, PAIRED_PARTS)
    if not found(text, SIDE_WORDS):
        if paired:
            r.warn(f"paired part ({', '.join(paired)}) without a side word: with the left shoulder selected, "
                   "'raven on shoulder' went to the right shoulder in 2 of 2 runs; say left or right")
        else:
            r.note("no side word; fine for a central part (helmet, blade), otherwise say left, right, front or back")
    if "keep everything else" in low or "leave everything else" in low or "keep the rest" in low:
        r.warn("'keep everything else unchanged' is added by Meshy's rewrite already; drop it")
    if hits := found(text, COLORS + MATERIALS):
        r.warn(f"color or material words ({', '.join(hits)}): Edit changes geometry only; "
               "send colors and materials to a retexture afterwards")
    if low.startswith("remove") and not re.search(r";|left behind|is bare|remains|empty|instead|in its place", low):
        r.note("for a removal, say what is left behind ('the left hand is an empty open palm'); "
               "that phrase decided the hand shape in testing")
    if len(low.split()) < 5:
        r.note("short prompt: the rewrite will invent the details you did not write")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kind", required=True, choices=["preview", "image", "texture", "edit"])
    ap.add_argument("--pose-mode", choices=["a-pose", "t-pose"], default=None,
                    help="image kind: the pose_mode you will send, to catch conflicting pose words")
    ap.add_argument("--max", type=int, default=MAX_CHARS, help="character cap (default 800)")
    ap.add_argument("prompt", nargs="*", help="the prompt; read from stdin when omitted")
    args = ap.parse_args(argv)
    text = " ".join(args.prompt).strip() if args.prompt else sys.stdin.read().strip()

    r = Report()
    common_checks(text, r, args.max)
    if text:
        {"preview": lambda: check_preview(text, r),
         "image": lambda: check_image(text, r, args.pose_mode),
         "texture": lambda: check_texture(text, r),
         "edit": lambda: check_edit(text, r)}[args.kind]()
    return r.emit()


if __name__ == "__main__":
    sys.exit(main())
