# Evidence: Meshy Edit (2026-10-14)

Base model: a knight figurine, made from a Text to Image picture through Meshy 7.1 Image to 3D with texture off, 579,084 faces. All edits ran in the web app's Edit Mode from the front view (view cube FRONT), and each pair of runs used the same lasso selection. 20 edits at 20 credits each.

## The ten tests

| Runs | Test | Selection | Prompt |
|---|---|---|---|
| 1-2 | Swap A | ellipse around the helmet | human head |
| 3-4 | Swap B | same | Replace the horned helmet with a bare human head, short cropped hair, square jaw, facing forward. |
| 5-6 | Add A | small ellipse on the left shoulder plate | raven on shoulder |
| 7-8 | Add B | same | Add a raven perched on the left shoulder, wings folded, facing forward, feet gripping the shoulder armor. |
| 9-10 | Shape A | polygon around the sword blade | make it thicker |
| 11-12 | Shape B | same | Make the sword blade twice as thick and twice as wide, with a rounded tip. |
| 13-14 | Remove A | ellipse around the shield and left fist | remove the shield |
| 15-16 | Remove B | same | Remove the shield; the left forearm is bare and the left hand is an empty open palm. |
| 17-18 | Generous selection | ellipse around the shield, whole left arm, shoulder plate and side of the torso | Remove B prompt |
| 19-20 | Keep phrase | helmet ellipse | Swap B prompt plus " Keep everything else unchanged." |

## Results (all 20 succeeded, 57 to 90 s each)

| Run | Faces | Result |
|---|---|---|
| 1 | 684,556 | human head, longer swept hair |
| 2 | 719,300 | human head, swept hair |
| 3 | 594,282 | head, buzz cut, square jaw |
| 4 | 771,930 | head, short textured hair, square jaw |
| 5 | 668,220 | raven beside the right (unselected) shoulder |
| 6 | 714,614 | raven away from the body on the right side in the front view |
| 7 | 687,152 | raven on the left shoulder, merged into the shield rim |
| 8 | 750,266 | raven on the left shoulder, clean (checked from the back) |
| 9 | 680,794 | blade wider, point kept, legs intact |
| 10 | 635,466 | blade wider, point kept, legs intact |
| 11 | 705,128 | wide rounded blade; right leg damaged |
| 12 | 785,996 | very wide blade overhanging the base; leg broken |
| 13 | 590,998 | shield gone, armored arm, relaxed hand |
| 14 | 590,572 | shield gone, armored gauntlet, curled hand |
| 15 | 594,360 | shield gone, armored arm, open palm, small wrist seam |
| 16 | 565,760 | shield gone, armored arm, open palm |
| 17 | 674,218 | shield gone, arm bare skin, hip pouch, torso seam |
| 18 | 606,716 | shield gone, arm bare skin, hip pouch |
| 19 | 731,438 | same as the template swap |
| 20 | 619,286 | same as the template swap |

## How Meshy read the prompts

Meshy rewrites each prompt into a longer instruction before the edit runs, based on what the camera shows. In these runs:

- "raven on shoulder" (run 5) was rewritten to put the raven on the shoulder on the viewer's left, which is the knight's right: the unselected side.
- The template prompt that named the left shoulder (run 7) was rewritten to the knight's left shoulder, the selected one.
- "make it thicker" (run 9) was rewritten as making the whole knight stockier; only the lasso kept the change on the blade.
- Every rewrite already asked for the rest of the model to stay the same, which is why adding "keep everything else unchanged" made no difference (runs 19-20).

## Not tested

Reference images, edits with no selection, textured or rigged inputs, and models other than this untextured Meshy 7.1 figure. Edit had no public API endpoint as of 2026-10-14.

## Sources

- [How to use Meshy Edit](https://help.meshy.ai/en/articles/900000026-how-to-use-meshy-edit): supported models, the lasso, the advice to enlarge the selection when a result looks wrong.
