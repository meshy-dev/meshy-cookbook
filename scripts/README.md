# Publishing the cookbook

The repository owns recipe text, runnable code, sample inputs, curated previews,
and publication metadata. A separate cookbook site consumes this export; no website
framework or deployment account is required here.

## Validate and export

From the repository root, with Python 3.10 or newer:

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python scripts/publish.py validate
python -m unittest discover -s tests -p 'test_publishing.py'
python scripts/publish.py build --output dist
```

These commands are offline after dependency installation. They never import a
recipe runner, read a live `.env`, call Meshy, or require generated `output/` files.
Use `python scripts/publish.py build --require-clean` for a release build from a
committed checkout. Development exports permit local changes and record that fact.
Only an empty destination or a previous export bearing `.meshy-cookbook-export`
can be replaced. Inside this repository, the destination must be `dist/` or below it.

## Authoring contract

Each `examples/*/recipe.yaml` follows the [recipe schema](../schemas/recipe.schema.json).
`slug` is the permanent page identity; `order` controls display order independently
of the numbered source folder. The metadata lists inputs, output formats, endpoints,
requested model policy, languages and runtimes, author, tags, historical credit/time
estimates, last live verification date, previews, and the sample-result record.

Paths in metadata are relative to the recipe directory except `languages.*.shared`,
which is relative to the repository root. Every published file must be explicitly
listed: language files, inputs, previews, and additional `assets` such as provenance
notes. The recipe README, recipe metadata, and sample-result record are included
automatically. Add new supporting source files to the relevant language's `files`
or `shared` array. Keep `.env.example` as an empty or clearly marked API-key template.

[Sample-result records](../schemas/sample-result.schema.json) separate historical
API measurements from later local artifact inspection. The checked-in records
identify exact artifacts by SHA-256 and size, without publishing models or claiming
a fresh live run. Updating a preview alone must not advance `last_verified`.

Validation checks schema types, dates, duplicate YAML keys, unique slugs/order,
listed files, repository containment, secret/runtime paths, symlinks, Python syntax,
and local Markdown links and heading fragments. Every fenced `python` statement in
a recipe README must also occur in its actual runner's syntax tree. This allows
excerpted code while catching stale payloads. Reference-style links and HTML
`src`/`href`/`poster` attributes are checked too. External URLs are left to editorial
review; validation does not contact them. TypeScript type checks and execution tests
are separate CI steps.

## Export contract, version 1

```text
dist/
├── catalog.json
├── recipes/<stable-slug>/
│   ├── README.md
│   ├── recipe.yaml
│   ├── sample-result.json
│   ├── python/…
│   ├── typescript/…
│   ├── input/…                 # when the recipe has file inputs
│   └── assets/…
├── shared/python/meshy.py
├── shared/typescript/meshy.ts
└── downloads/<stable-slug>.zip
```

All paths in the JSON export use forward slashes and are relative to the export
root. `catalog.json` contains:

- `schema_version`: the export contract version, currently `1`.
- `source`: the canonical repository URL, current Git `commit`, and `dirty` boolean.
  A non-Git development source has `null` commit and dirty values. Release mode
  rejects it. Untracked files count as dirty; ignored runtime output does not.
- `recipes`: metadata sorted by `order`, with `source_directory`, `markdown`,
  `download`, `files`, and `resolved_links` added. Each file records its original
  repository path, exported path, and content SHA-256.

The site should render the exported README and read language-tab code directly
from the exported entrypoint files. Metadata-relative paths can be resolved through
the `files` mapping using `source_directory`; shared source paths are already
repository-relative. Use `slug` to choose the site route and `order` for navigation.

### Resolve Markdown links before rendering

Exported Markdown retains its canonical repository-relative links. **Do not render
it unchanged against the site URL.** Each recipe's `resolved_links` supplies a
mapping keyed by the exported Markdown `from` path and exact `original` destination:

- `export_path` points to a copied asset, source file, or another recipe README.
- `page_slug`, when present, identifies a recipe page. Replace that link with the
  site's own route for the slug instead of a raw README URL.
- `repository_url` handles local source references outside published recipe files.
- `fragment` and `query` are separate fields to preserve when constructing the URL.

For example, `../02-image-to-low-poly-prop/` in the character README maps to
`page_slug: image-to-low-poly-prop`; `assets/result.png` maps to
`recipes/image-to-3d-character/assets/result.png`. The site adds its own content/CDN
base URL. This supports sites mounted under a prefix without embedding a guessed
production domain in the tutorials. The same mappings cover provenance Markdown
under `input/` and `assets/`.

For a clean export, construct View source URLs from `source.commit` and
`source_directory`. A dirty export's commit identifies its base, not the edited
content; the exported file hashes identify the actual content. A production site
should consume an export built with `--require-clean`.

### Downloadable examples

Each ZIP preserves `examples/<numbered-folder>/` and `shared/` so the existing
Python and TypeScript imports work after extraction. It includes both language
entrypoints, dependencies, `.env.example`, sample inputs, previews, metadata, and
shared clients. The bundle root has a generated setup README, `SOURCE.json`, and a
minimal `package.json` declaring ES modules for the shared TypeScript client.
Repository license files are included when present; a generated `AGENTS.md`
contains instructions scoped to the selected recipe. Links to other
recipes are rewritten to their GitHub source URLs inside bundled Markdown.

Bundles use an explicit file allowlist, fixed timestamps, and sorted entries.
They exclude live environment files, runtime checkpoints, generated model output,
toolchains, and private files. Repeated builds from the same source state produce
identical JSON and ZIP bytes. Serve model downloads from durable release or CDN
storage only after curating them separately; no expiring API URLs are published.
