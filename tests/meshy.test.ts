// Offline reliability checks. Every HTTP request is intercepted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Meshy, MeshyAPIError, MeshyTaskError, MeshyTimeoutError, type Task } from "../shared/typescript/meshy.js";
import { run } from "../examples/03-text-to-hero-prop/typescript/main.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

function task(endpoint: string, id: string): Task {
  return { id, status: "SUCCEEDED", progress: 100,
    image_urls: ["https://example.invalid/concept?signature=private"],
    model_urls: { glb: "https://example.invalid/model" }, thumbnail_url: "https://example.invalid/preview",
    consumed_credits: endpoint === "text-to-image" ? 9 : 35 };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const waited: string[] = [];
  const downloaded: string[] = [];
  return {
    created, waited, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "text-to-image" ? "concept-id" : "model-id";
    },
    async wait(endpoint: string, id: string) { waited.push(id); return task(endpoint, id); },
    async download(url: string, dest: string) { downloaded.push(dest); return dest; },
  };
}

async function directory(fn: (path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), "meshy-test-"));
  try { await fn(path); } finally { await rm(path, { recursive: true, force: true }); }
}

async function checkpoint(path: string, changes: Record<string, unknown> = {}) {
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, prompt: "A chest", concept_task_id: "concept-id", model_task_id: "model-id", creating: null, ...changes }));
}

test("resume both stages downloads without creating either task", async () => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, []);
  assert.deepEqual(client.waited, ["model-id"]);
  assert.equal(client.downloaded.length, 2);
}));

test("resume model does not depend on an expired concept", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const wait = client.wait;
  client.wait = async (endpoint, id) => {
    if (endpoint === "text-to-image") throw new MeshyAPIError(404, "expired concept");
    return wait(endpoint, id);
  };
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, true, output, client);
  assert.deepEqual(client.waited, ["model-id"]);
  assert.deepEqual(client.created, []);
  assert.match(String(logs.mock.calls[0].arguments[0]), /35 model credits; concept stage excluded/);
}));

test("resume concept creates only the missing model", async () => directory(async (output) => {
  await checkpoint(output, { model_task_id: null });
  const client = fakeClient();
  await run(undefined, true, output, client);
  assert.deepEqual(client.created, [{ endpoint: "image-to-3d", payload: {
    input_task_id: "concept-id", geometry_resolution: "4k", should_texture: true,
    enable_pbr: true, texture_resolution: "4k", target_formats: ["glb"],
  } }]);
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).model_task_id, "model-id");
}));

test("interruption after creation keeps the concept ID", async () => directory(async (output) => {
  const client = fakeClient();
  client.wait = async () => { throw new Error("interrupted"); };
  await assert.rejects(run("A chest", false, output, client), /interrupted/);
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.equal(state.concept_task_id, "concept-id");
  assert.equal(state.creating, null);
}));

test("new run checkpoints both IDs without signed URLs", async () => directory(async (output) => {
  const client = fakeClient();
  await run("A chest", false, output, client);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.equal(JSON.parse(state).model_task_id, "model-id");
  assert.doesNotMatch(state, /https|signature/);
  assert.deepEqual(await readdir(output), ["run.json"]);
}));

test("interruption after model creation resumes without new tasks", async () => directory(async (output) => {
  const client = fakeClient();
  const wait = client.wait;
  client.wait = async (endpoint, id) => {
    if (endpoint === "image-to-3d") throw new Error("interrupted");
    return wait(endpoint, id);
  };
  await assert.rejects(run("A chest", false, output, client), /interrupted/);
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).model_task_id, "model-id");
  client.wait = wait;
  await run(undefined, true, output, client);
  assert.equal(client.created.length, 2);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run("A chest", false, output, client), /lost response/);
  await assert.rejects(run(undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("invalid checkpoint, changed prompt and accidental new run fail before opening a client", async () => directory(async (output) => {
  const badStates = [ { version: true }, { prompt: "" }, { concept_task_id: 3 }, { concept_task_id: null },
    { model_task_id: "bad/id" }, { creating: "anything" }, { creating: "model" }, { extra: "secret" } ];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run("Another prompt", true, output), /differs/);
  await assert.rejects(run(undefined, false, output), /already exists/);
}));

test("text-to-3d is the only v2 endpoint", () => {
  assert.equal(Meshy.url("text-to-3d"), "https://api.meshy.ai/openapi/v2/text-to-3d");
  for (const endpoint of ["image-to-3d", "multi-image-to-3d", "text-to-image", "rigging", "retexture", "remesh"]) {
    assert.equal(Meshy.url(endpoint), `https://api.meshy.ai/openapi/v1/${endpoint}`);
  }
});

test("transient polling error retries then returns success", async () => {
  const client = new Meshy("offline-test", "/nonexistent/.env");
  let calls = 0;
  client.get = async () => { if (++calls === 1) throw new MeshyAPIError(503, "busy"); return task("image-to-3d", "x"); };
  assert.equal((await client.wait("image-to-3d", "x")).status, "SUCCEEDED");
  assert.equal(calls, 2);
});

test("terminal, auth and timeout errors stop polling", async () => {
  const client = new Meshy("offline-test", "/nonexistent/.env");
  for (const status of ["FAILED", "CANCELED"] as const) {
    let calls = 0;
    client.get = async () => { calls++; return { ...task("image-to-3d", "x"), status, task_error: { message: "bad input" } }; };
    await assert.rejects(client.wait("image-to-3d", "x"), MeshyTaskError);
    assert.equal(calls, 1);
  }
  let calls = 0;
  client.get = async () => { calls++; throw new MeshyAPIError(401, "unauthorized"); };
  await assert.rejects(client.wait("image-to-3d", "x"), MeshyAPIError);
  assert.equal(calls, 1);
  client.get = async () => ({ ...task("image-to-3d", "x"), status: "PENDING" });
  await assert.rejects(client.wait("image-to-3d", "x", "", 0), MeshyTimeoutError);
});

test("paid POST network error is never automatically retried", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(new Meshy("offline-test", "/nonexistent/.env").create("image-to-3d", {}), /lost response/);
  assert.equal(calls, 1);
});

test("download streams without auth and preserves previous file on stream failure", async () => directory(async (output) => {
  const dest = join(output, "model.glb");
  await writeFile(dest, "previous");
  let pulls = 0;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.headers, undefined);
    return new Response(new ReadableStream({ pull(controller) {
      if (++pulls === 1) controller.enqueue(new TextEncoder().encode("partial"));
      else controller.error(new Error("broken stream"));
    } }));
  };
  const client = new Meshy("offline-test", "/nonexistent/.env");
  await assert.rejects(client.download("https://example.invalid/signed", dest), /broken stream/);
  assert.equal(await readFile(dest, "utf8"), "previous");
  assert.deepEqual(await readdir(output), ["model.glb"]);
  globalThis.fetch = async () => new Response("complete");
  await client.download("https://example.invalid/signed", dest);
  assert.equal(await readFile(dest, "utf8"), "complete");
}));

test("invalid CLI inputs fail before a client can be opened", async () => directory(async (cwd) => {
  const cases: [string, string[]][] = [
    ...["NaN", "Infinity", "2.5", "99", "15001"].map((value): [string, string[]] => ["02-image-to-low-poly-prop", ["missing.png", value]]),
    ["02-image-to-low-poly-prop", ["missing.png"]], ["02-image-to-low-poly-prop", ["wrong.gif"]],
    ["04-photos-to-product-model", Array(5).fill("one.png")],
  ];
  for (const [recipe, args] of cases) {
    const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), join(ROOT, "examples", recipe, "typescript/main.ts"), ...args], {
      cwd, env: { ...process.env, MESHY_API_KEY: "" }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Face count|PNG or JPEG|ENOENT/);
    assert.doesNotMatch(result.stderr, /MESHY_API_KEY is not set/);
  }
}));
