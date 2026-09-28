# Contributing to the Meshy Cookbook

A recipe should help someone produce a specific 3D asset or complete a useful workflow. Explain when to use it, show an actual result, and provide code that runs from a fresh clone.

## Repository structure

- `examples/<recipe>/README.md` is the canonical tutorial, readable on GitHub and published by the cookbook site.
- `recipe.yaml` holds discovery metadata and the source, input, and preview paths consumed by the publisher. Its stable slug determines the public route independently of the numbered folder name.
- `sample-result.json` records a representative result and where its measurements came from. Separate historical observations from newly inspected files or newly executed runs.
- `input/` contains small sample inputs and `SOURCES.md` with attribution, licensing, and any generation prompts.
- `assets/` contains curated previews with provenance. Keep runtime output under the ignored language-specific `output/` directories.
- `python/` and `typescript/` contain runnable implementations with equivalent literal request payloads, dependency files, and `.env.example`.
- `shared/` contains the small HTTP, polling, and download clients. Keep workflow decisions in each example.

Use an existing recipe as the starting point. Give a new recipe a unique slug and meaningful title; folder numbering only suggests a reading order. Follow the metadata schema and export contract in [scripts/README.md](scripts/README.md).

## Tutorial checklist

1. Open with the intended result and an input-to-output preview. State whether the example is textured, rigged, optimized, or ready for a particular downstream use.
2. State required runtimes, API access, estimated credits, expected duration, and output formats. Link to current API pricing. Label measured timings and output statistics as observations rather than guarantees.
3. Include complete clone, install, environment, and run commands for both languages, followed by positional arguments for custom inputs.
4. Explain the workflow, relevant parameters, limitations, and how to inspect the files. Link to API reference pages for the full parameter definitions.
5. Keep executable Python snippets consistent with the runner. The publisher checks their statements against the Python source. Show the full source through language links or site code tabs.
6. Add an author, last verified date, recorded model information, and evidence for sample measurements. Updating prose or inspecting an old output does not count as a new live API verification.
7. Include provenance for inputs and previews. Identify synthetic sample images visibly. Use real photographs only when redistribution is permitted.
8. Explain recovery for workflows with multiple paid stages. Never imply that restarting a script cancels or resumes a remote task unless the code actually does so.

## Preview and model assets

Use actual saved generation results for output previews. For comparisons, distinguish pictured assets from measurements of separate historical runs. Preserve small images in `assets/` so GitHub, local clones, and exported pages work without a generation request.

Publish large curated GLB/USDZ files through durable release or CDN storage when a model download or interactive viewer is ready. Record their source and checksums. API task URLs are temporary and should not be used as permanent website assets. The four initial recipes currently publish static previews; a real photographed product example and hosted interactive model assets can be added when those assets are available.

## Local checks

From the repository root, with Python 3.10+ and Node.js 22+:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt -r examples/01-image-to-3d-character/python/requirements.txt
npm ci
python scripts/publish.py validate
python -m unittest discover -s tests -p 'test_*.py'
npm test
npm run check
python scripts/publish.py build --output dist
```

These checks are offline with respect to Meshy and must not create paid API tasks. Dependency installation needs network access. Test the important client failure and recovery paths with mocks. CI also compiles the Python examples and validates the publishing bundle.

Live smoke tests are separate: state the cost and obtain approval before running them. Record the date, exact submitted settings, task IDs locally, model information if available, elapsed time, consumed credits, and observed artifact measurements. Keep credentials, signed URLs, and private inputs out of Git and exported bundles.

## Publishing and review

Open one pull request containing the tutorial, both implementations, metadata, and preview changes. Check the generated catalog and article assets together. Review relative links and the complete example ZIP, including its shared client and inputs.

The website should build from a reviewed commit and retain the export's source provenance. Preview builds can use a dirty working tree, which is identified in the export. Keep tutorial content in this repository; the website owns navigation, presentation, language tabs, and viewers. A larger standalone application can live in its own repository and be linked from a cookbook recipe.
