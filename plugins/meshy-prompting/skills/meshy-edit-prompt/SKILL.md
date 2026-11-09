---
name: meshy-edit-prompt
description: Write the prompt for Meshy Edit, the web app tool that changes one lassoed part of a finished Meshy model (replace a helmet with a head, add a raven to a shoulder, widen a sword, remove a shield). Use this skill whenever the user mentions Meshy Edit, Edit Mode, a lasso or selection on a model, wants to change, swap, add, reshape or remove one part of an existing Meshy model without regenerating it, or asks why an edit landed on the wrong side, changed more than the selected part, damaged something behind it, or ignored "keep everything else the same". It covers the part-and-side formula, what the lasso controls versus the prompt, how Meshy rewrites the prompt, the untextured-model precondition and the 20-credit cost. Not for texture or color changes, which Edit cannot make (meshy-texture-prompt), for whole-model prompts (meshy-text-to-3d-prompt, meshy-image-prompt), or for the API, which has no Edit endpoint; it writes the prompt and the selection advice, it does not drive the web app.
license: MIT
metadata:
  author: meshy-dev
  version: "0.2.0"
---

# Meshy Edit prompts

Meshy Edit changes the geometry inside a lasso you draw on a finished model: you select a region, describe the change in a sentence, and get a new model with that part changed. The prompt names the part and its side, says what it becomes, and for a removal says what is left behind. In a 20-edit test on one knight figure (2026-10-14, two runs per prompt), every failure came from leaving one of those out or from a selection that took in a neighboring part. [references/evidence.md](references/evidence.md) has the runs.

Edit is in the web app only (the Edit button under the model in the workspace); there is no public API endpoint as of 2026-10-14. Each run costs 20 credits, takes 57 to 90 seconds, and is refunded if it errors.

## Before writing the prompt: check the model qualifies

- Edit needs an **untextured Meshy 6 or Meshy 7.1 model**, generated with texture off. Textured, uploaded, rigged and Split (separated-part) models are not supported yet. A textured model has to be regenerated mesh-only first (20 credits).
- Edit changes **geometry only**. "Gold", "leather" and "red" do nothing; send color and material changes to texturing (`meshy-texture-prompt`) after the edit.

## Workflow

1. **Confirm the model is untextured and the change is a shape change.** If not, say what to do instead.
2. **Tell the user how to draw the lasso.** Rotate the model until nothing sits behind the part, because the lasso selects straight through the model. Select only what should change: the lasso, not the prompt, sets how much of the model changes.
3. **Write the prompt with the formula.** Verb, the part with its side, what it becomes, two or three shape details, where it attaches or what remains.
4. **Check it.** Run `python3 scripts/check_prompt.py --kind edit "…"` (path relative to this skill's directory). It flags "it" without a named part, a missing side word, color and material words, and "keep everything else unchanged".
5. **Tell the user to run it two or three times and look at every side**, since results vary between runs and a change can affect what was behind the selection.

## The formula

```
[Replace / Add / Make / Remove] the [selected part, with its side] [with / into] [new part], [2 to 3 shape details], [where it attaches, or what is left behind].
```

Tested prompts and what they did (two runs each):

| Edit | Short prompt | Template prompt |
|---|---|---|
| Swap the helmet | "human head": head in 2 of 2, hair style invented (longer, swept back) | "Replace the horned helmet with a bare human head, short cropped hair, square jaw, facing forward.": cropped hair and square jaw in 2 of 2 |
| Add to the left shoulder plate | "raven on shoulder": raven on the unselected right side in 2 of 2 | "Add a raven perched on the left shoulder, wings folded, facing forward, feet gripping the shoulder armor.": left shoulder in 2 of 2; one clean, one merged into the shield rim |
| Reshape the sword blade | "make it thicker": blade visibly wider, point kept, legs intact in 2 of 2 | "Make the sword blade twice as thick and twice as wide, with a rounded tip.": wide rounded blade in 2 of 2, but the leg behind the blade was damaged in both |
| Remove the shield | "remove the shield": shield gone in 2 of 2; a different hand each run | "Remove the shield; the left forearm is bare and the left hand is an empty open palm.": shield gone, open palm in 2 of 2 |

Swaps were the most reliable edit: all six helmet-to-head runs replaced the helmet and left the rest untouched. Adding a part was clean in 1 of 4 runs and reshaping in 2 of 4, so for adds and reshapes plan on several runs.

## Rules, each with the run behind it

- **Name the part and its side.** With the left shoulder selected, "raven on shoulder" went to the other side both times; "the left shoulder" went to the selected one both times. "it" and an unsided part name are the two words most likely to misfire, because Meshy rewrites your sentence before the edit runs (see "How Meshy reads the prompt" below) and the rewrite did not reliably know where the selection was: "make it thicker" was rewritten as "make the whole knight stockier", and only the lasso kept the change on the blade.
- **Write the shape details you care about.** The rewrite fills in the rest. "human head" got swept-back hair nobody asked for; "short cropped hair, square jaw" got exactly that.
- **For a removal, say what is left behind.** "an empty open palm" was the only difference between the two remove prompts, and it decided the hand shape.
- **Leave out "keep everything else unchanged".** Every rewrite already adds it; two runs with the phrase matched two without.
- **Describe shape, not color or material.** Edit changes geometry only.
- **Size words are loose.** "Twice as wide" gave a blade that looks more than twice as wide in one run and overhung the base.
- **The lasso decides how much changes.** With the same prompt ("the left forearm is bare"), a tight lasso around the shield kept the forearm armor, while a wide lasso around the whole arm stripped the arm's armor and added a hip pouch nobody asked for. Meshy's help article suggests a larger selection when a result looks wrong; expect more of the model to change when you do.
- **Rotate before you lasso.** The blade sat in front of a leg, the leg was selected too, and both wide-blade runs damaged it.

## How Meshy reads the prompt

Meshy rewrites your sentence into a longer instruction before the edit runs, based on what the camera currently shows, and the rewrite already asks for everything outside the selection to stay the same. This is why side words matter (left and right can be read from the viewer's side rather than the model's), why "it" is risky, and why "keep everything else unchanged" is redundant. A lasso drawn the same way from the same view selects the same region, so a rerun changes only the result, not the selection.

## Output format

```
Selection: <what to lasso, from which view, and what to rotate out from behind it>
Prompt: <one sentence in the formula>
Runs: <2 or 3; which sides to check afterwards>
After: <"retexture with …" when the user wanted a color or material change too>
```

## Resources

| File | Use it when |
|---|---|
| [references/evidence.md](references/evidence.md) | You need the 20 runs: prompts, selections, face counts, per-run results, the generous-lasso and keep-phrase arms, how Meshy read each prompt |
| `scripts/check_prompt.py` | Lint a drafted prompt: `python3 scripts/check_prompt.py --kind edit "<prompt>"` |

Related skills: `meshy-texture-prompt` for color and material changes, `meshy-text-to-3d-prompt` and `meshy-image-prompt` when the change is big enough to regenerate the model, `meshy-3d-generation` to make the untextured base model through the API.
