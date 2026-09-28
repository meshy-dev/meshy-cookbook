// Offline lifecycle tests for cookbook 10. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Printability, Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/10-image-to-printable-parts/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const MODEL_PAYLOAD = { should_texture: false, target_formats: ["glb"] };
const CHECK_PAYLOAD = { input_task_id: "model-id" };
const SPLIT_PAYLOAD = { input_task_id: "model-id", target_formats: ["glb", "3mf"], layout: "on_plate" };
const PRINTABILITY: Printability = {
  status: "warning", issue_count: 1, error_count: 0, warning_count: 1,
  metrics: { is_watertight: true, volume: 1.25, non_manifold_edges: 0, degenerate_faces: 12, holes: 0 },
};
const IDS: Record<string, string> = { "image-to-3d": "model-id", "print/analyze": "check-id", "print/split": "split-id" };

function task(endpoint: string, id: string): Task {
  const base = { id, status: "SUCCEEDED" as const, progress: 100, image_urls: [], consumed_credits: 0,
    model_urls: { glb: "https://example.invalid/model.glb?signature=private" }, thumbnail_url: "https://example.invalid/preview" };
  if (endpoint === "image-to-3d") return { ...base, consumed_credits: 20 };
  if (endpoint === "print/analyze") return { ...base, printability: PRINTABILITY };
  return { ...base, consumed_credits: 10, part_count: 5, thumbnail_url: "https://example.invalid/plate",
    model_urls: { glb: "https://example.invalid/parts.glb", "3mf": "https://example.invalid/parts.3mf?signature=private" } };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return IDS[endpoint];
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/figure.png", model_task_id: "model-id", split_task_id: "split-id", creating: null, ...changes }));
}

test("new run sends the three payloads in order and checkpoints paid IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, false, output, client);
  const [model, check, split] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(check, { endpoint: "print/analyze", payload: CHECK_PAYLOAD });
  assert.deepEqual(split, { endpoint: "print/split", payload: SPLIT_PAYLOAD });
  assert.deepEqual(client.downloaded, ["model-thumbnail.png", "printable-parts.3mf", "printable-parts.glb", "printable-parts-thumbnail.png"]);
  assert.deepEqual(JSON.parse(await readFile(join(output, "printability.json"), "utf8")), PRINTABILITY);
  const printed = logs.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(printed.includes("Printability warning: watertight yes, 0 holes, 0 non-manifold edges, 12 degenerate faces"));
  assert.match(printed[printed.length - 1], /5 parts, 30 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).split_task_id, "split-id");
  assert.doesNotMatch(state, /https|signature|check-id/);
}));

test("a custom image reaches the payload and the checkpoint", async (context) => directory(async (output) => {
  const image = join(output, "figure.png");
  await writeFile(image, Buffer.from("not really a png"));
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(image, false, output, client);
  assert.match(String(client.created[0].payload.image_url), /^data:image\/png;base64,/);
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).image, image);
}));

test("resume both stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["split-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /10 split credits; model stage excluded/);
  await assert.rejects(stat(join(output, "printability.json")), /ENOENT/);
}));

test("resume model repeats the free check and creates only the split", async (context) => directory(async (output) => {
  await checkpoint(output, { split_task_id: null });
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "print/analyze", payload: CHECK_PAYLOAD }, { endpoint: "print/split", payload: SPLIT_PAYLOAD }]);
  await stat(join(output, "printability.json"));
}));

test("an interruption during the check resumes without a second model task", async (context) => directory(async (output) => {
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  const wait = client.wait;
  client.wait = async (endpoint, id, label) => { if (endpoint === "print/analyze") throw new Error("interrupted"); return wait(endpoint, id, label); };
  await assert.rejects(run(undefined, false, output, client), /interrupted/);
  client.wait = wait;
  await run(undefined, true, output, client);
  assert.deepEqual(client.created.map((call) => call.endpoint), ["image-to-3d", "print/analyze", "print/analyze", "print/split"]);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("invalid checkpoint, changed input, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run("wrong.gif", false, output), /PNG or JPEG/);
  await assert.rejects(run("missing.png", false, output), /ENOENT|does not exist/);
  const badStates = [ { version: true }, { image: "" }, { model_task_id: null }, { split_task_id: "bad/id" },
    { creating: "anything" }, { creating: "split" }, { creating: "check" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other.png", true, output), /Image differs/);
  await assert.rejects(run(undefined, false, output), /already exists/);
}));
