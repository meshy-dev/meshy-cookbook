// Build a dense textured prop from an image, then simplify it to a quad mesh at a face budget, as GLB and FBX.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_IMAGE = join(DIRECTORY, "../input/sea-chest.png");
const SAMPLE_POLYCOUNT = 20000;
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  image: string;
  polycount: number;
  model_task_id: string | null;
  remesh_task_id: string | null;
  creating: "model" | "remesh" | null;
}

/** Atomically checkpoint only the inputs and task IDs, never signed URLs or keys. */
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

const validPolycount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 300000;

async function loadState(path: string, image?: string, polycount?: number): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "image", "polycount", "model_task_id", "remesh_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  if (!validPolycount(state.polycount)) throw new Error("Invalid polycount in run.json");
  for (const key of ["model_task_id", "remesh_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.remesh_task_id && !state.model_task_id) throw new Error("run.json has a remesh task without a model task");
  if (![null, "model", "remesh"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (polycount !== undefined && polycount !== state.polycount) throw new Error("Face count differs from run.json; resume with its original face count");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(image?: string, polycount?: number, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (polycount !== undefined && !validPolycount(polycount)) throw new Error("Face count must be an integer from 100 to 300000");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, image, polycount); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, image: image ?? SAMPLE_IMAGE, polycount: polycount ?? SAMPLE_POLYCOUNT, model_task_id: null, remesh_task_id: null, creating: null };
  }
  const imageUrl = state.model_task_id === null ? await Meshy.dataUri(state.image) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let modelId = state.model_task_id;
  if (modelId === null) {
    state.creating = "model";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    modelId = await client.create("image-to-3d", {
      image_url: imageUrl,
      should_texture: true,
      enable_pbr: true,
      target_formats: ["glb"],
    });
    state.model_task_id = modelId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let model: Task | undefined;
  let remeshId = state.remesh_task_id;
  if (remeshId === null) {
    model = await client.wait("image-to-3d", modelId, "model");
    await client.download(model.model_urls.glb, join(output, "dense-prop.glb"));
    await client.download(model.thumbnail_url, join(output, "dense-prop-thumbnail.png"));
    state.creating = "remesh";
    await saveState(checkpoint, state);
    remeshId = await client.create("remesh", {
      input_task_id: modelId,
      topology: "quad",
      target_polycount: state.polycount,
      target_formats: ["glb", "fbx"],
    });
    state.remesh_task_id = remeshId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("remesh", remeshId, "remesh");
  await client.download(task.model_urls.glb, join(output, "simplified-prop.glb"));
  await client.download(task.model_urls.fbx!, join(output, "simplified-prop.fbx"));
  await client.download(task.thumbnail_url, join(output, "simplified-prop-thumbnail.png"));
  const credits = model !== undefined
    ? `${model.consumed_credits + task.consumed_credits} credits total`
    : `${task.consumed_credits} remesh credits; model stage excluded`;
  console.log(`Done: ${join(output, "simplified-prop.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 2) throw new Error("Usage: npm start -- [--resume] [image.png] [face_count]");
  const polycount = positional[1] === undefined ? undefined : Number(positional[1]);
  await run(positional[0], polycount, args.includes("--resume"));
}
