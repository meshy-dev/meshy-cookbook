// Offline lifecycle tests for cookbook 14. No test creates a Meshy task.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, test } from "node:test";
import { Meshy, MeshyAPIError, type Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/14-image-to-style-matched-prop/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const DESCRIPTION = "A wooden signpost with two chunky orange arrow signs pointing left and right, a thick light brown wooden post with a rounded top, a few tufts of green grass around its foot, and a square cream stone base";
const PROMPT_TAIL = ", full object, three-quarter front view, centered with space around it, painted in the same art style, palette and brushwork as the reference image, painted highlights and soft shadows, soft even studio lighting, plain white background, single object, no props, no text";
const CONCEPT_PAYLOAD = { ai_model: "gpt-image-2-5-sunburst", prompt: DESCRIPTION + PROMPT_TAIL, aspect_ratio: "1:1" };
const MESH_PAYLOAD = { input_task_id: "concept-id", model_type: "smart-topology", ai_model: "meshy-t2.5", target_polycount: 5000, should_texture: false, target_formats: ["glb"] };
const TEXTURE_PAYLOAD = { input_task_id: "mesh-id", ai_model: "meshy-n1", enable_pbr: false, target_formats: ["glb"] };
const CREDITS: Record<string, number> = { "image-to-image": 12, "image-to-3d": 5, retexture: 10 };
const IDS: Record<string, string> = { "image-to-image": "concept-id", "image-to-3d": "mesh-id", retexture: "texture-id" };
const CONCEPT_BYTES = Buffer.from("\x89PNG saved concept", "latin1");

function task(endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100, consumed_credits: CREDITS[endpoint],
    image_urls: ["https://example.invalid/concept.png?signature=private"],
    model_urls: { glb: "https://example.invalid/model?signature=private" }, thumbnail_url: "https://example.invalid/preview" };
}

/** The payload minus a data URI field, after checking the field is a PNG data URI. */
function without(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: value, ...rest } = payload;
  const uri = key === "reference_image_urls" ? (value as string[])[0] : value;
  if (key === "reference_image_urls") assert.equal((value as string[]).length, 1);
  assert.match(String(uri), /^data:image\/png;base64,/);
  return rest;
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
    async download(_url: string, dest: string) { downloaded.push(basename(dest)); await writeFile(dest, CONCEPT_BYTES); return dest; },
  };
}

async function directory(fn: (path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), "meshy-test-"));
  try { await fn(path); } finally { await rm(path, { recursive: true, force: true }); }
}

async function checkpoint(path: string, changes: Record<string, unknown> = {}) {
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, description: DESCRIPTION, reference: "/missing/art.png", concept_task_id: "concept-id", mesh_task_id: "mesh-id", texture_task_id: "texture-id", creating: null, ...changes }));
}

test("new run sends three payloads in order and checkpoints IDs only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [concept, mesh, texture] = client.created;
  assert.equal(concept.endpoint, "image-to-image");
  assert.deepEqual(without(concept.payload, "reference_image_urls"), CONCEPT_PAYLOAD);
  assert.deepEqual(Object.keys(concept.payload), ["ai_model", "prompt", "reference_image_urls", "aspect_ratio"]);
  assert.deepEqual(mesh, { endpoint: "image-to-3d", payload: MESH_PAYLOAD });
  assert.equal(texture.endpoint, "retexture");
  assert.deepEqual(without(texture.payload, "image_style_url"), TEXTURE_PAYLOAD);
  assert.deepEqual(Object.keys(texture.payload), ["input_task_id", "ai_model", "image_style_url", "enable_pbr", "target_formats"]);
  assert.deepEqual(client.downloaded, ["prop-concept.png", "prop.glb", "prop-thumbnail.png"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /27 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).texture_task_id, "texture-id");
  assert.doesNotMatch(state, /https|signature/);
}));

test("the texture stage sends the saved concept file", async (context) => directory(async (output) => {
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  assert.equal(client.created[2].payload.image_style_url, `data:image/png;base64,${CONCEPT_BYTES.toString("base64")}`);
}));

test("a custom description and reference reach the concept payload and the checkpoint", async (context) => directory(async (output) => {
  const reference = join(import.meta.dirname, "../examples/13-image-to-threejs-character/input/concept-art.png");
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run("A sci-fi supply crate", reference, false, output, client);
  assert.equal(client.created[0].payload.prompt, `A sci-fi supply crate${PROMPT_TAIL}`);
  assert.deepEqual(client.created[0].payload.reference_image_urls, [await Meshy.dataUri(reference)]);
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.description, state.reference], ["A sci-fi supply crate", reference]);
}));

test("resume all stages never creates or reads the reference", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["texture-id"]);
  assert.match(String(logs.mock.calls[0].arguments[0]), /10 texture credits; concept and mesh stages excluded/);
}));

test("resume concept creates the mesh and the texture", async (context) => directory(async (output) => {
  await checkpoint(output, { mesh_task_id: null, texture_task_id: null });
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created[0], { endpoint: "image-to-3d", payload: MESH_PAYLOAD });
  assert.deepEqual(without(client.created[1].payload, "image_style_url"), TEXTURE_PAYLOAD);
  assert.match(String(logs.mock.calls[0].arguments[0]), /27 credits total/); // the concept task is retrieved again for its image
}));

test("resume mesh creates only the texture from the saved concept", async (context) => directory(async (output) => {
  await checkpoint(output, { texture_task_id: null });
  await writeFile(join(output, "prop-concept.png"), CONCEPT_BYTES);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, true, output, client);
  assert.equal(client.created.length, 1);
  assert.deepEqual(without(client.created[0].payload, "image_style_url"), TEXTURE_PAYLOAD);
  assert.match(String(logs.mock.calls[0].arguments[0]), /15 credits for mesh and texture; concept stage excluded/);
}));

test("a missing concept file stops before the texture POST without a marker", async () => directory(async (output) => {
  await checkpoint(output, { texture_task_id: null });
  const client = fakeClient();
  await assert.rejects(run(undefined, undefined, true, output, client), /ENOENT/);
  assert.deepEqual(client.created, []);
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).creating, null);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("a refused texture keeps the mesh, and resume retries it", async (context) => directory(async (output) => {
  context.mock.method(console, "log", () => {});
  const client = fakeClient();
  const create = client.create;
  client.create = async (endpoint: string, payload: Record<string, unknown>) => {
    if (endpoint === "retexture") throw new MeshyAPIError(400, "meshy-n1 does not support enable_pbr");
    return create(endpoint, payload);
  };
  await assert.rejects(run(undefined, undefined, false, output, client), MeshyAPIError);
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.concept_task_id, state.mesh_task_id, state.texture_task_id, state.creating], ["concept-id", "mesh-id", null, null]);
  client.create = create;
  await run(undefined, undefined, true, output, client);
  assert.deepEqual(client.created.map((call) => call.endpoint), ["image-to-image", "image-to-3d", "retexture"]);
}));

test("a server error keeps the creating marker", async () => directory(async (output) => {
  const client = fakeClient();
  client.create = async () => { throw new MeshyAPIError(500, "Internal error"); };
  await assert.rejects(run(undefined, undefined, false, output, client), MeshyAPIError);
  await assert.rejects(run(undefined, undefined, true, output, client), /outcome.*unknown/);
}));

test("invalid checkpoint, changed inputs, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run(undefined, "wrong.gif", false, output), /PNG, JPEG or WebP/);
  await assert.rejects(run(undefined, "missing.png", false, output), /ENOENT|does not exist/);
  await assert.rejects(run("  ", undefined, false, output), /cannot be empty/);
  const badStates = [ { version: true }, { description: " " }, { reference: "" }, { reference: null },
    { concept_task_id: null }, { mesh_task_id: null }, { texture_task_id: "bad/id" },
    { creating: "anything" }, { creating: "texture" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("A barrel", undefined, true, output), /Description differs/);
  await assert.rejects(run(undefined, "other.png", true, output), /Reference image differs/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));
