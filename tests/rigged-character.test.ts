// Offline lifecycle tests for cookbook 05. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/05-image-to-rigged-character/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const MODEL_PAYLOAD = { pose_mode: "a-pose", should_remesh: true, target_polycount: 30000, should_texture: true, enable_pbr: true, target_formats: ["glb"] };
const RIG_PAYLOAD = { input_task_id: "model-id", height_meters: 1.8 };

function task(endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100, image_urls: [],
    model_urls: { glb: "https://example.invalid/model" }, thumbnail_url: "https://example.invalid/preview",
    consumed_credits: endpoint === "rigging" ? 5 : 30,
    result: endpoint === "rigging" ? {
      rigged_character_glb_url: "https://example.invalid/rig.glb?signature=private",
      rigged_character_fbx_url: "https://example.invalid/rig.fbx",
      basic_animations: { walking_glb_url: "https://example.invalid/walk.glb", running_glb_url: "https://example.invalid/run.glb" },
    } : undefined };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "rigging" ? "rig-id" : "model-id";
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/character.png", model_task_id: "model-id", rig_task_id: "rig-id", creating: null, ...changes }));
}

test("new run sends both payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, false, output, client);
  const [model, rig] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(rig, { endpoint: "rigging", payload: RIG_PAYLOAD });
  assert.deepEqual(client.downloaded, ["character-thumbnail.png", "rigged-character.glb", "rigged-character.fbx", "walking.glb", "running.glb"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /35 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).rig_task_id, "rig-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("resume both stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["rig-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /5 rig credits; model stage excluded/);
}));

test("resume model creates only the rig", async () => directory(async (output) => {
  await checkpoint(output, { rig_task_id: null });
  const client = fakeClient();
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "rigging", payload: RIG_PAYLOAD }]);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("invalid checkpoint, changed image, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run("wrong.gif", false, output), /PNG or JPEG/);
  await assert.rejects(run("missing.png", false, output), /ENOENT|does not exist/);
  const badStates = [ { version: true }, { image: "" }, { model_task_id: null }, { rig_task_id: "bad/id" },
    { creating: "anything" }, { creating: "rig" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other.png", true, output), /differs/);
  await assert.rejects(run(undefined, false, output), /already exists/);
}));
