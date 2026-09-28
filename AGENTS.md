# Using the Meshy cookbook

Pick the recipe that matches the user's input and outcome, then read its README, the
selected language's `main` file, and the shared client it imports.

| Input / outcome | Recipe |
|---|---|
| One image → character or prop GLB | `examples/01-image-to-3d-character` |
| One concept image → low-poly GLB at a chosen face count | `examples/02-image-to-low-poly-prop` |
| Description → concept image → textured prop GLB | `examples/03-text-to-hero-prop` |
| One to four product photos, front first → GLB and USDZ | `examples/04-photos-to-product-model` |
| One humanoid character image → rigged GLB/FBX with walk and run clips | `examples/05-image-to-rigged-character` |
| A style prompt → the low-poly oak restyled as a textured GLB with PBR maps | `examples/06-text-to-restyled-prop` |
| Description → untextured preview mesh → textured GLB, with the text-to-3d endpoint | `examples/07-text-to-3d-prop` |
| One image → dense textured model → simplified quad mesh at a face budget, as GLB and FBX | `examples/08-image-to-simplified-prop` |
| One humanoid character image → rigged character with idle, jump and attack clips in one file, as GLB and FBX | `examples/09-image-to-animated-character` |
| One image → untextured mesh, a free printability check, then parts laid out on the build plate as 3MF and GLB | `examples/10-image-to-printable-parts` |
| One image → textured model → multi-color 3MF for a multi-filament printer, realistic or cartoon colors | `examples/11-image-to-multi-color-print` |

- A live run spends Meshy credits; each README states the amount. Tell the user the cost
  and wait for their approval before running, unless they already gave it.
- Use the language the user names or their project already uses. Otherwise use Python.
  Both versions send the same payloads.
- Read `MESHY_API_KEY` from the environment or a local `.env`. Never write it into code or
  ask for it in chat, and keep API calls on the server in browser apps.
- Custom inputs are positional arguments: an image path, a description, or photo paths;
  cookbooks 02 and 08 also take a face count after the image, cookbook 06 takes a style prompt
  first, then an optional image, cookbook 09 takes action ids first, then an optional image,
  cookbook 10 takes only an image, and cookbook 11 takes a color style (realistic or cartoon) after the image. Leave the sample defaults in the code.
- To adapt a recipe into a project, copy `shared/<language>/meshy.*` next to the pipeline
  and keep the payloads literal.

## Maintaining and publishing recipes

- Preserve each README as the canonical tutorial. Keep its `recipe.yaml`, sample-result
  record, curated preview assets, and both implementations consistent.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [publishing contract](scripts/README.md)
  before adding a recipe or changing its published structure.
- Run `python scripts/publish.py validate` and the offline checks documented in
  `CONTRIBUTING.md`. Publishing and tests must not spend Meshy credits.
- Keep a recipe's public slug stable when changing its folder name or display order.
- A documentation edit or inspection of a saved artifact is not a new live verification;
  retain the original observation date and describe the evidence accurately.
