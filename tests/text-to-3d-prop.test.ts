// Offline lifecycle tests for cookbook 07. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/07-text-to-3d-prop/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const SAMPLE_PROMPT =
  "A retro toy rocket ship: a rounded silver body with a red nose cone, three red tail fins, " +
  "a round porthole window on the side, standing upright on its fins. Stylized hand-painted game prop.";
const PREVIEW_PAYLOAD = { mode: "preview", prompt: SAMPLE_PROMPT, should_remesh: false, target_formats: ["glb"] };
const REFINE_PAYLOAD = { mode: "refine", preview_task_id: "preview-id", enable_pbr: true, target_formats: ["glb"] };

function task(_endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100, image_urls: [],
    model_urls: { glb: "https://example.invalid/model.glb?signature=private" }, thumbnail_url: "https://example.invalid/preview",
    consumed_credits: id === "refine-id" ? 10 : 20 };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return payload.mode === "refine" ? "refine-id" : "preview-id";
    },
    async wait(endpoint: string, id: string, _label?: string) { waited.push(id); return task(endpoint, id); },
    async download(_url: string, dest: string) { downloaded.push(basename(dest)); return dest; },
  };
}

async function directory(fn: (path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), "meshy-test-"));
  try { await fn(path); } finally { await rm(path, { recursive: true, force: true }); }
}

async function checkpoint(path: string, changes: Record<string, unknown> = {}) {
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, prompt: SAMPLE_PROMPT, preview_task_id: "preview-id", refine_task_id: "refine-id", creating: null, ...changes }));
}

test("new run sends both payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, false, output, client);
  assert.deepEqual(client.created, [{ endpoint: "text-to-3d", payload: PREVIEW_PAYLOAD }, { endpoint: "text-to-3d", payload: REFINE_PAYLOAD }]);
  assert.deepEqual(client.downloaded, ["preview-thumbnail.png", "textured-prop.glb", "textured-prop-thumbnail.png"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /30 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).refine_task_id, "refine-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("a custom description reaches the payload and the checkpoint", async (context) => directory(async (output) => {
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run("A ceramic teapot", false, output, client);
  assert.equal(client.created[0].payload.prompt, "A ceramic teapot");
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).prompt, "A ceramic teapot");
}));

test("resume both stages never creates", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["refine-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /10 refine credits; preview stage excluded/);
}));

test("resume preview creates only the refine", async () => directory(async (output) => {
  await checkpoint(output, { refine_task_id: null });
  const client = fakeClient();
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "text-to-3d", payload: REFINE_PAYLOAD }]);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("invalid checkpoint, changed description, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run("  ", false, output), /empty/);
  await assert.rejects(run("x".repeat(801), false, output), /800 characters/);
  const badStates = [ { version: true }, { prompt: " " }, { preview_task_id: null }, { refine_task_id: "bad/id" },
    { creating: "anything" }, { creating: "refine" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other description", true, output), /Prompt differs/);
  await assert.rejects(run(undefined, false, output), /already exists/);
}));
