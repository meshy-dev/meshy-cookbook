// Build a cabinet knob from one image, size it in millimetres, cut a screw thread into its stem, and check it for printing.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import Module, { type Manifold as Solid } from "manifold-3d";
import { Meshy, MeshyAPIError, type Printability, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_IMAGE = join(DIRECTORY, "../input/sunburst-knob.png");
const SAMPLE_SCREW = "8-32";
const OUTPUT = join(DIRECTORY, "output");

const CAP_DIAMETER_MM = 38.0; // the knob's widest point, across the cap
const SCREWS = { "8-32": [4.166, 25.4 / 32], M4: [4.0, 0.7] } as const; // outside diameter and pitch (rise per turn), in mm
const CLEARANCE_MM = 0.15; // added to the hole's radius so the screw turns in printed plastic
const HOLE_DEPTH_MM = 12.0;
const COUNTERBORE_MM = [5.2, 1.0] as const; // diameter and depth of the wider step at the opening

const manifold = await Module();
manifold.setup();
const { CrossSection, Manifold, Mesh } = manifold;

type Screw = keyof typeof SCREWS;

interface RunState {
  version: 1;
  image: string;
  screw: Screw;
  model_task_id: string | null;
  creating: "model" | null;
}

/** Atomically checkpoint only the inputs and the task ID, never signed URLs or keys. */
async function saveState(path: string, state: RunState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const validScrew = (value: unknown): value is Screw => typeof value === "string" && Object.hasOwn(SCREWS, value);

async function loadState(path: string, image?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "image", "screw", "model_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  if (!validScrew(state.screw)) throw new Error("Invalid screw in run.json");
  const value = state.model_task_id;
  if (value !== null && (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value))) throw new Error("Invalid model_task_id in run.json");
  if (![null, "model"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

/** Binary STL to shared vertices and triangles. STL stores the three corners of every triangle separately. */
export async function readStl(path: string): Promise<[number[], number[]]> {
  const data = await readFile(path);
  const count = data.length >= 84 ? data.readUInt32LE(80) : -1;
  if (data.length !== 84 + 50 * count) throw new Error(`${path.split("/").pop()} is not a binary STL`);
  const index = new Map<string, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (let corner = 0; corner < count * 3; corner++) {
    const offset = 84 + Math.floor(corner / 3) * 50 + 12 + (corner % 3) * 12;
    const xyz = [data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8)];
    const key = xyz.join(",");
    if (!index.has(key)) {
      index.set(key, vertices.length / 3);
      vertices.push(...xyz);
    }
    triangles.push(index.get(key)!);
  }
  return [vertices, triangles];
}

/** How many triangles share each edge of each triangle. A closed surface has exactly two everywhere. */
function edgeCounts(triangles: number[]): number[] {
  const edges = triangles.map((a, i) => {
    const b = triangles[i % 3 === 2 ? i - 2 : i + 1];
    return a < b ? `${a},${b}` : `${b},${a}`;
  });
  const counts = new Map<string, number>();
  for (const edge of edges) counts.set(edge, (counts.get(edge) ?? 0) + 1);
  return edges.map((edge) => counts.get(edge)!);
}

/** Remove the triangles on broken edges, then close each gap with a fan of triangles around its centre. */
export function closeGaps(vertices: number[], triangles: number[]): [number[], number[], number] {
  const counts = edgeCounts(triangles);
  const kept: number[] = [];
  let broken = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    if (counts[i] !== 2 || counts[i + 1] !== 2 || counts[i + 2] !== 2) broken++;
    else kept.push(triangles[i], triangles[i + 1], triangles[i + 2]);
  }
  if (broken === 0) return [vertices, triangles, 0];
  const keptCounts = edgeCounts(kept);
  const following = new Map<number, number[]>();
  kept.forEach((a, i) => {
    const b = kept[i % 3 === 2 ? i - 2 : i + 1];
    if (keptCounts[i] !== 1) return;
    if (!following.has(b)) following.set(b, []);
    following.get(b)!.push(a); // walk each gap backwards so the new triangles face outward
  });
  const newVertices = [...vertices];
  const newTriangles = [...kept];
  while (following.size > 0) {
    const loop = [following.keys().next().value!];
    for (;;) {
      const steps = following.get(loop.at(-1)!);
      if (steps === undefined) throw new Error("model.stl has a gap that cannot be closed automatically; regenerate the model");
      const step = steps.pop()!;
      if (steps.length === 0) following.delete(loop.at(-1)!);
      if (step === loop[0]) break;
      loop.push(step);
    }
    const centre = newVertices.length / 3;
    for (const axis of [0, 1, 2]) newVertices.push(loop.reduce((sum, v) => sum + vertices[v * 3 + axis], 0) / loop.length);
    loop.forEach((a, i) => newTriangles.push(a, loop[(i + 1) % loop.length], centre));
  }
  return [newVertices, newTriangles, broken];
}

/** The empty space the screw needs: its own 60-degree thread, widened by the clearance, plus the counterbore. */
export function threadCutter(screw: Screw): Solid {
  const [diameter, pitch] = SCREWS[screw];
  const outer = diameter / 2 + CLEARANCE_MM;
  const inner = outer - (5 / 8) * (Math.sqrt(3) / 2) * pitch; // a standard thread is 5/8 of a sharp 60-degree V deep
  const points: [number, number][] = [];
  for (let i = 0; i < 96; i++) { // one pitch of the thread profile, wrapped once around the axis
    const t = i / 96;
    let radius: number;
    if (t < 5 / 16) radius = inner + ((outer - inner) * t) / (5 / 16); // flank up to the outer radius
    else if (t < 7 / 16) radius = outer; // flat at the outer radius for 1/8 of a pitch
    else if (t < 12 / 16) radius = outer - ((outer - inner) * (t - 7 / 16)) / (5 / 16); // flank back down
    else radius = inner; // flat at the inner radius for 1/4 of a pitch
    points.push([radius * Math.cos(2 * Math.PI * t), radius * Math.sin(2 * Math.PI * t)]);
  }
  const length = HOLE_DEPTH_MM + 1; // start 1 mm below the base so the hole opens cleanly
  const turns = length / pitch;
  const thread = Manifold.extrude(new CrossSection([points]), length, Math.round(turns * 32), 360 * turns); // one turn per pitch
  const counterbore = Manifold.cylinder(COUNTERBORE_MM[1] + 1, COUNTERBORE_MM[0] / 2, COUNTERBORE_MM[0] / 2, 64);
  return thread.add(counterbore).translate([0, 0, -1]);
}

async function writeStl(path: string, solid: Solid): Promise<void> {
  const mesh = solid.getMesh();
  const count = mesh.triVerts.length / 3;
  const data = Buffer.alloc(84 + 50 * count);
  data.write("Meshy cookbook knob, millimetres".padEnd(80, " "), 0, "latin1");
  data.writeUInt32LE(count, 80);
  for (let i = 0; i < count; i++) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((axis) => mesh.vertProperties[mesh.triVerts[i * 3 + k] * mesh.numProp + axis]));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.max(Math.hypot(...normal), 1e-12);
    [...normal.map((n) => n / length), ...a, ...b, ...c].forEach((value, k) => data.writeFloatLE(value, 84 + i * 50 + k * 4));
  }
  await writeFile(path, data);
}

/** The solid as a GLB data URL with positions and triangles only, turned Y-up as glTF expects. */
function glbDataUri(solid: Solid): string {
  const mesh = solid.getMesh();
  const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
  for (let i = 0; i < positions.length / 3; i++) {
    const [x, y, z] = [0, 1, 2].map((axis) => mesh.vertProperties[i * mesh.numProp + axis]);
    positions.set([x, z, -y], i * 3);
  }
  const indices = Uint32Array.from(mesh.triVerts);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const bounds = (pick: (a: number, b: number) => number) => [0, 1, 2].map((axis) => positions.filter((_, i) => i % 3 === axis).reduce((a, b) => pick(a, b)));
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: bounds(Math.min), max: bounds(Math.max) },
      { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
  };
  let text = Buffer.from(JSON.stringify(gltf));
  text = Buffer.concat([text, Buffer.alloc(-text.length & 3, " ")]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(28 + text.length + binary.length, 8); // total length
  header.writeUInt32LE(text.length, 12); // JSON chunk
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0); // BIN chunk
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return `data:model/gltf-binary;base64,${Buffer.concat([header, text, binaryHeader, binary]).toString("base64")}`;
}

export async function run(screw?: string, image?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (screw !== undefined && !validScrew(screw.toUpperCase())) throw new Error("Screw must be 8-32 or M4");
  const chosen = screw?.toUpperCase() as Screw | undefined;
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, image); // validate before opening a client
    state.screw = chosen ?? state.screw; // the thread is cut on your computer, so a resume may change it
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, image: image ?? SAMPLE_IMAGE, screw: chosen ?? SAMPLE_SCREW, model_task_id: null, creating: null };
  }
  const imageUrl = state.model_task_id === null ? await Meshy.dataUri(state.image) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let modelId = state.model_task_id;
  const created = modelId === null;
  if (modelId === null) {
    state.creating = "model";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    try {
      modelId = await client.create("image-to-3d", {
        image_url: imageUrl,
        should_texture: false,
        target_formats: ["stl"],
      });
    } catch (error) {
      if (error instanceof MeshyAPIError && error.refused) { // Meshy refused the request, so no task exists and resume may try again
        state.creating = null;
        await saveState(checkpoint, state);
      }
      throw error;
    }
    state.model_task_id = modelId;
    state.creating = null;
  }
  await saveState(checkpoint, state);
  const model: Task = await client.wait("image-to-3d", modelId, "model");
  await client.download(model.model_urls.stl!, join(output, "model.stl"));
  await client.download(model.thumbnail_url, join(output, "model-thumbnail.png"));

  // Size the knob and cut the thread. This runs on your computer and costs nothing.
  const [vertices, triangles, replaced] = closeGaps(...(await readStl(join(output, "model.stl"))));
  let solid: Solid;
  try {
    solid = new Manifold(new Mesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triangles) }));
  } catch (error) {
    throw new Error(`model.stl is not watertight (${(error as Error).message}); regenerate the model`);
  }
  solid = solid.decompose().reduce((largest, piece) => (piece.volume() > largest.volume() ? piece : largest)); // drop any loose fragments
  const { min, max } = solid.boundingBox();
  const scale = CAP_DIAMETER_MM / Math.max(max[0] - min[0], max[1] - min[1]); // the file has no units, so the cap sets the size
  const knob = solid.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]]).scale([scale, scale, scale]);
  const finished = knob.subtract(threadCutter(state.screw));
  const knobFile = join(output, `knob-${state.screw}.stl`);
  await writeStl(knobFile, finished);
  const height = Math.round((max[2] - min[2]) * scale * 100) / 100;
  if (replaced) console.log(`Closed the gaps left by ${replaced} broken triangles`);
  console.log(`Knob: ${CAP_DIAMETER_MM.toFixed(2)} mm across, ${height.toFixed(2)} mm tall, ${state.screw} thread ${HOLE_DEPTH_MM} mm deep`);

  // The printability check is free, so a resumed run repeats it instead of checkpointing it.
  const reports: Record<string, Printability> = {};
  for (const [name, part] of [["without_hole", knob], ["finished", finished]] as const) {
    const checkId = await client.create("print/analyze", {
      model_url: glbDataUri(part),
      printer_type: "fdm",
      intended_print_height_mm: height,
    });
    const report = (await client.wait("print/analyze", checkId, "check")).printability as Printability;
    reports[name] = report;
    console.log(
      `Printability ${name.replace("_", " ")}: ${report.status}, watertight ${report.metrics.is_watertight ? "yes" : "no"}, `
      + `${report.metrics.non_manifold_edges} non-manifold edges, thin walls ${(report.thin_walls!.thin_area_ratio * 100).toFixed(1)}%`,
    );
  }
  await writeFile(join(output, `printability-${state.screw}.json`), `${JSON.stringify(reports, null, 2)}\n`);
  const credits = created ? `${model.consumed_credits} credits total` : "model stage excluded; the thread and the checks are free";
  console.log(`Done: ${knobFile}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 2) throw new Error("Usage: npm start -- [--resume] [screw] [image.png]");
  await run(positional[0], positional[1], args.includes("--resume"));
}
