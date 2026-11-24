# Character Studio

The tutorial is [../README.md](../README.md). Read it before running or changing the app.

- A Next.js app built on the published `@ui-sdk/*` packages. Before writing UI, read the skill that ships with the SDK, `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` (the package may be installed at the repository root), then the component pages it points to in `@ui-sdk/react/docs/`.
- Every control an agent should drive is a UI SDK component with an accessible name. `src/components/studio-agent.test.tsx` enforces that.
- Server code talks to Meshy; the browser never sees the API key or Meshy's signed asset URLs. Generating a character costs about 38 credits and a generated motion about 13: tell the user the cost and wait for their approval before pressing either button.
- Without a key, the server can use the Meshy CLI's sign-in by running `meshy api` (`src/lib/meshy-cli.ts`). Never read, copy or edit the CLI's config folder or credential files; only the CLI touches them.
- Before committing: `npm run check` (route types, TypeScript and the tests) and `npm run build`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
