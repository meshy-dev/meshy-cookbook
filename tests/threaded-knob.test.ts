// Offline lifecycle and geometry tests for cookbook 12. No test creates a Meshy task.
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, afterEach, before, test } from "node:test";
import Module from "manifold-3d";
import { MeshyAPIError, type Task } from "../shared/typescript/meshy.js";
import { closeGaps, readStl, run, threadCutter } from "../examples/12-image-to-threaded-knob/typescript/main.js";

const blockNetwork: typeof fetch = async () => { throw new Error("Unexpected HTTP request in offline test"); };
globalThis.fetch = blockNetwork;
afterEach(() => { globalThis.fetch = blockNetwork; });

const manifold = await Module();
manifold.setup();
const { Manifold, Mesh } = manifold;
const MODEL_PAYLOAD = { ai_model: "meshy-7.1", should_texture: false, target_formats: ["stl"] };
const REPORT = { status: "healthy", metrics: { is_watertight: true, non_manifold_edges: 0 }, thin_walls: { thin_area_ratio: 0.04 } };
let fixtures: string;
let knobStl: string;

function stl(mesh: { vertProperties: Float32Array; triVerts: Uint32Array; numProp: number }): Buffer {
  const count = mesh.triVerts.length / 3;
  const data = Buffer.alloc(84 + 50 * count);
  data.writeUInt32LE(count, 80);
  for (let i = 0; i < count * 3; i++) {
    for (const axis of [0, 1, 2]) data.writeFloatLE(mesh.vertProperties[mesh.triVerts[i] * mesh.numProp + axis], 84 + Math.floor(i / 3) * 50 + 12 + (i % 3) * 12 + axis * 4);
  }
  return data;
}

async function solidFromStl(path: string) {
  const [vertices, triangles] = await readStl(path);
  return new Manifold(new Mesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triangles) }));
}

/** Smallest and largest distance from the axis to the hole wall in one horizontal slice. */
function holeRadii(solid: { slice(z: number): { toPolygons(): [number, number][][] } }, z: number): [number, number] {
  const contours = solid.slice(z).toPolygons().map((contour) => contour.map(([x, y]) => Math.hypot(x, y)));
  const hole = contours.reduce((a, b) => (Math.max(...b) < Math.max(...a) ? b : a));
  return [Math.min(...hole), Math.max(...hole)];
}

before(async () => {
  // A plain knob in Image to 3D's units: a stem under a wider cap, about 1.9 units across.
  fixtures = await mkdtemp(join(tmpdir(), "meshy-knob-"));
  knobStl = join(fixtures, "knob.stl");
  const knob = Manifold.cylinder(1.0, 0.3, 0.3, 64).add(Manifold.cylinder(0.6, 0.95, 0.95, 128).translate([0, 0, 1.0]));
  await writeFile(knobStl, stl(knob.translate([0.2, -0.1, 0.05]).getMesh()));
});
after(async () => rm(fixtures, { recursive: true, force: true }));

function task(endpoint: string, id: string): Task {
  const base = { id, status: "SUCCEEDED" as const, progress: 100, image_urls: [], thumbnail_url: "https://example.invalid/preview" };
  if (endpoint === "print/analyze") return { ...base, consumed_credits: 0, model_urls: { glb: "" }, printability: REPORT as Task["printability"] };
  return { ...base, consumed_credits: 20, model_urls: { glb: "", stl: "https://example.invalid/model.stl?signature=private" } };
}

function fakeClient() {
  const created: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const downloaded: string[] = [];
  let checks = 0;
  return {
    created, downloaded,
    async create(endpoint: string, payload: Record<string, unknown>) {
      created.push({ endpoint, payload });
      return endpoint === "print/analyze" ? `check-${++checks}` : "model-id";
    },
    async wait(endpoint: string, id: string, _label?: string) { return task(endpoint, id); },
    async download(url: string, dest: string) {
      downloaded.push(basename(dest));
      if (url.includes("model.stl")) await copyFile(knobStl, dest);
      else await writeFile(dest, "png");
      return dest;
    },
  };
}

async function directory(fn: (path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), "meshy-test-"));
  try { await fn(path); } finally { await rm(path, { recursive: true, force: true }); }
}

async function checkpoint(path: string, changes: Record<string, unknown> = {}) {
  await writeFile(join(path, "run.json"), JSON.stringify({ version: 1, image: "/missing/knob.png", screw: "8-32", model_task_id: "model-id", creating: null, ...changes }));
}

test("new run sends the model and both checks in order and checkpoints the ID only", async (context) => directory(async (output) => {
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const [model, withoutHole, finished] = client.created;
  assert.equal(model.endpoint, "image-to-3d");
  const { image_url, ...rest } = model.payload;
  assert.match(String(image_url), /^data:image\/png;base64,/);
  assert.deepEqual(rest, MODEL_PAYLOAD);
  for (const check of [withoutHole, finished]) {
    const { model_url, ...payload } = check.payload;
    assert.equal(check.endpoint, "print/analyze");
    assert.match(String(model_url), /^data:model\/gltf-binary;base64,Z2xURg/);
    assert.deepEqual(payload, { printer_type: "fdm", intended_print_height_mm: 32 });
  }
  assert.deepEqual(client.downloaded, ["model.stl", "model-thumbnail.png"]);
  assert.deepEqual((await readdir(output)).sort(), ["knob-8-32.stl", "model-thumbnail.png", "model.stl", "printability-8-32.json", "run.json"]);
  assert.deepEqual(JSON.parse(await readFile(join(output, "printability-8-32.json"), "utf8")), { without_hole: REPORT, finished: REPORT });
  assert.match(String(logs.mock.calls.at(-1)!.arguments[0]), /20 credits total/);
  const state = await readFile(join(output, "run.json"), "utf8");
  assert.deepEqual(JSON.parse(state), { version: 1, image: join(import.meta.dirname, "../examples/12-image-to-threaded-knob/input/sunburst-knob.png"), screw: "8-32", model_task_id: "model-id", creating: null });
  assert.doesNotMatch(state, /https|signature/);
}));

test("the knob is sized and threaded for each screw", async (context) => {
  context.mock.method(console, "log", () => {});
  const expected = { "8-32": [1.804, 2.233], M4: [1.771, 2.15] } as const;
  for (const [screw, [inner, outer]] of Object.entries(expected)) {
    await directory(async (output) => {
      await run(screw.toLowerCase(), undefined, false, output, fakeClient());
      const knob = await solidFromStl(join(output, `knob-${screw}.stl`));
      assert.equal(knob.status(), "NoError");
      const { min, max } = knob.boundingBox();
      assert.ok(Math.abs(max[0] - min[0] - 38) < 0.001);
      assert.ok(Math.abs(min[2]) < 1e-5);
      assert.ok(Math.abs(max[2] - 32) < 0.001);
      assert.ok(Math.abs((min[0] + max[0]) / 2) < 0.001);
      const [low, high] = holeRadii(knob, 6);
      assert.ok(Math.abs(low - inner) < 0.01, `${screw} inner radius ${low}`);
      assert.ok(Math.abs(high - outer) < 0.01, `${screw} outer radius ${high}`);
      assert.ok(Math.abs(holeRadii(knob, 0.5)[1] - 2.6) < 0.01); // the counterbore
    });
  }
});

test("the thread turns one pitch per revolution, to the right", () => {
  const cutter = threadCutter("M4");
  const radiusAt = (z: number, degrees: number) => {
    const points = cutter.slice(z).toPolygons().flat();
    const angle = (p: [number, number]) => Math.abs(((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360 - degrees);
    const nearest = points.reduce((a, b) => (angle(b) < angle(a) ? b : a));
    return Math.hypot(...nearest);
  };
  for (let k = 0; k < 16; k++) {
    const z = 5 + (k * 0.7) / 16;
    assert.ok(Math.abs(radiusAt(z, 0) - radiusAt(z + 0.7 / 4, 90)) < 0.02); // a right-hand thread rises a quarter pitch per quarter turn
    assert.ok(Math.abs(radiusAt(z, 0) - radiusAt(z + 0.7, 0)) < 0.02);
  }
});

test("closeGaps repairs a stray triangle", () => {
  const cube = Manifold.cube([1, 1, 1]).getMesh();
  const vertices = Array.from(cube.vertProperties);
  const triangles = Array.from(cube.triVerts);
  const broken = [...triangles, ...triangles.slice(0, 3)]; // one triangle twice: three edges shared by three triangles
  const solid = (v: number[], t: number[]) => new Manifold(new Mesh({ numProp: 3, vertProperties: new Float32Array(v), triVerts: new Uint32Array(t) }));
  assert.throws(() => solid(vertices, broken), /Not manifold/);
  const [fixedVertices, fixedTriangles, removed] = closeGaps(vertices, broken);
  assert.equal(removed, 5);
  const fixed = solid(fixedVertices, fixedTriangles);
  assert.equal(fixed.status(), "NoError");
  assert.equal(fixed.genus(), 0);
  assert.equal(closeGaps(vertices, triangles)[2], 0);
});

test("resume with another screw recuts without creating a model", async (context) => directory(async (output) => {
  await checkpoint(output);
  const client = fakeClient();
  const logs = context.mock.method(console, "log", () => {});
  await run("M4", undefined, true, output, client);
  assert.deepEqual(client.created.map((call) => call.endpoint), ["print/analyze", "print/analyze"]);
  assert.ok((await readdir(output)).includes("knob-M4.stl"));
  assert.equal(JSON.parse(await readFile(join(output, "run.json"), "utf8")).screw, "M4");
  assert.match(String(logs.mock.calls.at(-1)!.arguments[0]), /model stage excluded/);
}));

test("the GLB sent to the check is Y-up in millimetres", async (context) => directory(async (output) => {
  const client = fakeClient();
  context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  const data = Buffer.from(String(client.created[1].payload.model_url).split(",")[1], "base64");
  const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  assert.equal(data.subarray(0, 4).toString(), "glTF");
  assert.equal(data.readUInt32LE(8), data.length);
  const [low, high] = [gltf.accessors[0].min, gltf.accessors[0].max];
  assert.ok(Math.abs(high[1] - 32) < 0.001 && Math.abs(low[1]) < 1e-5); // height along Y
  assert.ok(Math.abs(high[0] - low[0] - 38) < 0.001 && Math.abs(high[2] - low[2] - 38) < 0.001);
}));

test("an unknown POST outcome cannot create a duplicate on resume", async () => directory(async (output) => {
  let calls = 0;
  const client = fakeClient();
  client.create = async () => { calls++; throw new TypeError("lost response"); };
  await assert.rejects(run(undefined, undefined, false, output, client), /lost response/);
  await assert.rejects(run(undefined, undefined, true, output, client), /outcome.*unknown/);
  assert.equal(calls, 1);
}));

test("a refused model request clears the marker, and resume tries again", async (context) => directory(async (output) => {
  context.mock.method(console, "log", () => {});
  const client = fakeClient();
  const create = client.create;
  client.create = async () => { throw new MeshyAPIError(402, "Insufficient credits"); };
  await assert.rejects(run(undefined, undefined, false, output, client), MeshyAPIError);
  const state = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual([state.model_task_id, state.creating], [null, null]);
  client.create = create;
  await run(undefined, undefined, true, output, client);
  assert.equal(client.created[0].endpoint, "image-to-3d");
}));

test("invalid checkpoint, changed image, bad input and accidental new run fail before opening a client", async () => directory(async (output) => {
  await assert.rejects(run(undefined, "wrong.gif", false, output), /PNG, JPEG or WebP/);
  await assert.rejects(run(undefined, "missing.png", false, output), /ENOENT|does not exist/);
  for (const screw of ["M5", "8/32", ""]) await assert.rejects(run(screw, undefined, false, output), /8-32 or M4/);
  const badStates = [{ version: true }, { image: "" }, { screw: "M5" }, { screw: null }, { model_task_id: "bad/id" }, { creating: "check" }, { extra: "secret" }];
  for (const state of badStates) {
    await checkpoint(output, state);
    await assert.rejects(run(undefined, undefined, true, output), /run.json|outcome/);
  }
  await checkpoint(output);
  await assert.rejects(run(undefined, "other.png", true, output), /Image differs/);
  await assert.rejects(run(undefined, undefined, false, output), /already exists/);
}));

test("a check that can't measure thin walls still saves both reports", async (context) => directory(async (output) => {
  const client = fakeClient();
  const unmeasured = { ...REPORT, thin_walls: { thin_area_ratio: null } };
  client.wait = async (endpoint: string, id: string) => {
    const result = task(endpoint, id);
    return endpoint === "print/analyze" ? { ...result, printability: unmeasured as unknown as Task["printability"] } : result;
  };
  const logs = context.mock.method(console, "log", () => {});
  await run(undefined, undefined, false, output, client);
  assert.deepEqual(JSON.parse(await readFile(join(output, "printability-8-32.json"), "utf8")), { without_hole: unmeasured, finished: unmeasured });
  assert.ok(logs.mock.calls.some((call) => /thin walls unmeasured/.test(String(call.arguments[0]))));
}));
