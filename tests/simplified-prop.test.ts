// Offline lifecycle tests for cookbook 08. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/08-image-to-simplified-prop/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const MODEL_PAYLOAD = { should_texture: true, enable_pbr: true, target_formats: ["glb"] };
const REMESH_PAYLOAD = { input_task_id: "model-id", topology: "quad", target_polycount: 20000, target_formats: ["glb", "fbx"] };

function task(endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100, image_urls: [],
    model_urls: { glb: "https://example.invalid/model.glb?signature=private", fbx: "https://example.invalid/model.fbx" },
    thumbnail_url: "https://example.invalid/preview", consumed_credits: endpoint === "remesh" ? 5 : 30 };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "remesh" ? "remesh-id" : "model-id";
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/prop.png", polycount: 20000, model_task_id: "model-id", remesh_task_id: "remesh-id", creating: null, ...changes }));
}

test("new run sends both payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [model, remesh] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(remesh, { endpoint: "remesh", payload: REMESH_PAYLOAD });
  assert.deepEqual(client.downloaded, ["dense-prop.glb", "dense-prop-thumbnail.png", "simplified-prop.glb", "simplified-prop.fbx", "simplified-prop-thumbnail.png"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /35 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).remesh_task_id, "remesh-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("a custom image and face count reach the payloads and the checkpoint", async (context) => directory(async (output) => {
  const image = join(output, "prop.png");
  await writeFile(image, Buffer.from("not really a png"));
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(image, 5000, false, output, client);
  assert.match(String(client.created[0].payload.image_url), /^data:image\/png;base64,/);
  assert.equal(client.created[1].payload.target_polycount, 5000);
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.image, state.polycount], [image, 5000]);
}));

test("resume both stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["remesh-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /5 remesh credits; model stage excluded/);
}));

test("resume model creates only the remesh", async () => directory(async (output) => {
  await checkpoint(output, { remesh_task_id: null });
  const client = fakeClient();
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "remesh", payload: REMESH_PAYLOAD }]);
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
  for (const polycount of [99, 300001, 2.5, Number.NaN]) await assert.rejects(run(undefined, polycount, false, output), /100 to 300000/);
  const badStates = [ { version: true }, { image: "" }, { polycount: 99 }, { polycount: "20000" }, { model_task_id: null }, { remesh_task_id: "bad/id" },
    { creating: "anything" }, { creating: "remesh" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other.png", undefined, true, output), /Image differs/);
  await assert.rejects(run(undefined, 5000, true, output), /Face count differs/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));
