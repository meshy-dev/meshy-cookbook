// Offline lifecycle tests for cookbook 06. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import type { Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/06-text-to-restyled-prop/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const SAMPLE_PROMPT =
  "An oak tree in autumn: rough dark brown bark with deep vertical grooves on the trunk, " +
  "dense orange and gold leaves on the canopy. Stylized hand-painted game prop.";
const MODEL_PAYLOAD = { model_type: "smart-topology", target_polycount: 1000, should_texture: false, target_formats: ["glb"] };
const RETEXTURE_PAYLOAD = { input_task_id: "model-id", text_style_prompt: SAMPLE_PROMPT, enable_original_uv: false, enable_pbr: true, target_formats: ["glb"] };
const TEXTURE_FILES = ["base-color.png", "metallic.png", "roughness.png", "normal.png"];

function task(endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100, image_urls: [],
    model_urls: { glb: "https://example.invalid/model.glb?signature=private" }, thumbnail_url: "https://example.invalid/preview",
    consumed_credits: endpoint === "retexture" ? 10 : 5,
    texture_urls: endpoint === "retexture" ? [{ base_color: "https://example.invalid/base", metallic: "https://example.invalid/metallic",
      roughness: "https://example.invalid/roughness", normal: "https://example.invalid/normal" }] : undefined };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "retexture" ? "retexture-id" : "model-id";
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
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, prompt: SAMPLE_PROMPT, image: "/missing/prop.png", model_task_id: "model-id", retexture_task_id: "retexture-id", creating: null, ...changes }));
}

test("new run sends both payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [model, retexture] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  assert.deepEqual(retexture, { endpoint: "retexture", payload: RETEXTURE_PAYLOAD });
  assert.deepEqual(client.downloaded, ["low-poly-prop-thumbnail.png", "restyled-prop.glb", "restyled-prop-thumbnail.png", ...TEXTURE_FILES]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /15 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).retexture_task_id, "retexture-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("a custom prompt and image reach the payloads and the checkpoint", async (context) => directory(async (output) => {
  const image = join(output, "prop.png");
  await writeFile(image, Buffer.from("not really a png"));
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run("Blue stone", image, false, output, client);
  assert.match(String(client.created[0].payload.image_url), /^data:image\/png;base64,/);
  assert.equal(client.created[1].payload.text_style_prompt, "Blue stone");
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.prompt, state.image], ["Blue stone", image]);
}));

test("resume both stages never creates or reads the image", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["retexture-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /10 retexture credits; model stage excluded/);
}));

test("resume model creates only the retexture", async () => directory(async (output) => {
  await checkpoint(output, { retexture_task_id: null });
  const client = fakeClient();
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "retexture", payload: RETEXTURE_PAYLOAD }]);
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
  await assert.rejects(run("  ", undefined, false, output), /empty/);
  await assert.rejects(run("x".repeat(801), undefined, false, output), /800 characters/);
  const badStates = [ { version: true }, { prompt: " " }, { image: "" }, { model_task_id: null }, { retexture_task_id: "bad/id" },
    { creating: "anything" }, { creating: "retexture" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("other style", undefined, true, output), /Prompt differs/);
  await assert.rejects(run(undefined, "other.png", true, output), /Image differs/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));
