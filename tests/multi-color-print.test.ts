// Offline lifecycle tests for cookbook 11. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/11-image-to-multi-color-print/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const MODEL_PAYLOAD = { should_texture: true, enable_pbr: false, target_formats: ["glb"] };
const PRINT_PAYLOAD = { input_task_id: "model-id", max_colors: 4, style: "realistic" };

function task(endpoint: string, id: string): Task {
  const base = { id, status: "SUCCEEDED" as const, progress: 100, image_urls: [], thumbnail_url: "https://example.invalid/preview" };
  if (endpoint === "print/multi-color") return { ...base, consumed_credits: 10, model_urls: { glb: "", "3mf": "https://example.invalid/print.3mf?signature=private" } };
  return { ...base, consumed_credits: 30, model_urls: { glb: "https://example.invalid/model.glb?signature=private" } };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "print/multi-color" ? "print-id" : "model-id";
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/prop.png", style: "realistic", model_task_id: "model-id", print_task_id: "print-id", creating: null, ...changes }));
}

test("new run sends both payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [model, print] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(print, { endpoint: "print/multi-color", payload: PRINT_PAYLOAD });
  assert.deepEqual(client.downloaded, ["textured-model.glb", "textured-model-thumbnail.png", "multi-color-print.3mf"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /40 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).print_task_id, "print-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("a custom image and style reach the payloads and the checkpoint", async (context) => directory(async (output) => {
  const image = join(output, "prop.png");
  await writeFile(image, Buffer.from("not really a png"));
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(image, "cartoon", false, output, client);
  assert.match(String(client.created[0].payload.image_url), /^data:image\/png;base64,/);
  assert.equal(client.created[1].payload.style, "cartoon");
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.image, state.style], [image, "cartoon"]);
}));

test("resume both stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["print-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /10 print credits; model stage excluded/);
}));

test("resume model creates only the print task with the saved style", async () => directory(async (output) => {
  await checkpoint(output, { print_task_id: null, style: "cartoon" });
  const client = fakeClient();
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "print/multi-color", payload: { ...PRINT_PAYLOAD, style: "cartoon" } }]);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("invalid checkpoint, changed inputs, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run("wrong.gif", undefined, false, output), /PNG or JPEG/);
  await assert.rejects(run("missing.png", undefined, false, output), /ENOENT|does not exist/);
  for (const style of ["vivid", "Realistic", ""]) await assert.rejects(run(undefined, style, false, output), /realistic or cartoon/);
  const badStates = [ { version: true }, { image: "" }, { style: "vivid" }, { style: null }, { model_task_id: null }, { print_task_id: "bad/id" },
    { creating: "anything" }, { creating: "print" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other.png", undefined, true, output), /Image differs/);
  await assert.rejects(run(undefined, "cartoon", true, output), /Style differs/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));
