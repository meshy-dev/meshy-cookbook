// Offline lifecycle tests for cookbook 09. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/09-image-to-animated-character/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const MODEL_PAYLOAD = { pose_mode: "a-pose", should_remesh: true, target_polycount: 30000, should_texture: true, enable_pbr: true, target_formats: ["glb"] };
const RIG_PAYLOAD = { input_task_id: "model-id", height_meters: 1.8 };
const ANIMATION_PAYLOAD = { rig_task_id: "rig-id", action_ids: [0, 466, 4] };
const CREDITS: Record<string, number> = { "image-to-3d": 30, rigging: 5, animations: 9 };
const IDS: Record<string, string> = { "image-to-3d": "model-id", rigging: "rig-id", animations: "animation-id" };

function task(endpoint: string, id: string): Task {
  const base = { id, status: "SUCCEEDED" as const, progress: 100, image_urls: [], consumed_credits: CREDITS[endpoint],
    model_urls: { glb: "https://example.invalid/model" }, thumbnail_url: "https://example.invalid/preview" };
  if (endpoint === "rigging") {
    return { ...base, result: {
      rigged_character_glb_url: "https://example.invalid/rig.glb?signature=private",
      rigged_character_fbx_url: "https://example.invalid/rig.fbx",
      basic_animations: { walking_glb_url: "https://example.invalid/walk.glb", running_glb_url: "https://example.invalid/run.glb" },
    } };
  }
  if (endpoint === "animations") {
    return { ...base, result: { animation_glb_url: "https://example.invalid/clips.glb?signature=private", animation_fbx_url: "https://example.invalid/clips.fbx" } };
  }
  return base;
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/character.png", actions: [0, 466, 4], model_task_id: "model-id", rig_task_id: "rig-id", animation_task_id: "animation-id", creating: null, ...changes }));
}

test("new run sends three payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [model, rig, animation] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(rig, { endpoint: "rigging", payload: RIG_PAYLOAD });
  assert.deepEqual(animation, { endpoint: "animations", payload: ANIMATION_PAYLOAD });
  assert.deepEqual(client.downloaded, ["character-thumbnail.png", "animated-character.glb", "animated-character.fbx"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /44 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).animation_task_id, "animation-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("custom actions reach the animation payload and the checkpoint", async (context) => directory(async (output) => {
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run([243, 463], undefined, false, output, client);
  assert.deepEqual(client.created[2], { endpoint: "animations", payload: { rig_task_id: "rig-id", action_ids: [243, 463] } });
  assert.deepEqual(JSON.parse(await readFile(join(output, "run.json"), "utf8")).actions, [243, 463]);
}));

test("resume all stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["animation-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /9 animation credits; model and rig stages excluded/);
}));

test("resume model creates the rig and the animation", async (context) => directory(async (output) => {
  await checkpoint(output, { rig_task_id: null, animation_task_id: null });
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "rigging", payload: RIG_PAYLOAD }, { endpoint: "animations", payload: ANIMATION_PAYLOAD }]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /44 credits total/); // the model task is retrieved again for its thumbnail
}));

test("resume rig creates only the animation", async (context) => directory(async (output) => {
  await checkpoint(output, { animation_task_id: null });
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "animations", payload: ANIMATION_PAYLOAD }]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /14 credits for rig and animation; model stage excluded/);
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
  await assert.rejects(run(undefined, "wrong.gif", false, output), /PNG or JPEG/);
  await assert.rejects(run(undefined, "missing.png", false, output), /ENOENT|does not exist/);
  for (const actions of [[], [0, 0], [...Array(11).keys()], [-1], [4.5]]) {
    await assert.rejects(run(actions, undefined, false, output), /one to ten different action ids/);
  }
  const badStates = [ { version: true }, { image: "" }, { actions: [] }, { actions: [0, 0] }, { actions: ["4"] },
    { model_task_id: null }, { rig_task_id: null }, { animation_task_id: "bad/id" },
    { creating: "anything" }, { creating: "animation" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run(undefined, "other.png", true, output), /Image differs/);
  await assert.rejects(run([0, 466], undefined, true, output), /Actions differ/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));
