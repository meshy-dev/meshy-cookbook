// Turn character concept art into a rigged GLB with walking and running clips.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type RiggingResult, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE = join(DIRECTORY, "../input/concept-art.png");
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  image: string;
  model_task_id: string | null;
  rig_task_id: string | null;
  creating: "model" | "rig" | null;
}

/** Atomically checkpoint only the input path and task IDs, never signed URLs or keys. */
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

async function loadState(path: string, image?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "image", "model_task_id", "rig_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  for (const key of ["model_task_id", "rig_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.rig_task_id && !state.model_task_id) throw new Error("run.json has a rig task without a model task");
  if (![null, "model", "rig"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(image?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, image); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, image: image ?? SAMPLE, model_task_id: null, rig_task_id: null, creating: null };
  }
  const imageUrl = state.model_task_id === null ? await Meshy.dataUri(state.image) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let modelId = state.model_task_id;
  if (modelId === null) {
    state.creating = "model";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    modelId = await client.create("image-to-3d", {
      image_url: imageUrl,
      pose_mode: "a-pose",
      should_remesh: true,
      target_polycount: 30000,
      should_texture: true,
      enable_pbr: true,
      target_formats: ["glb"],
    });
    state.model_task_id = modelId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let model: Task | undefined;
  let rigId = state.rig_task_id;
  if (rigId === null) {
    model = await client.wait("image-to-3d", modelId, "model");
    await client.download(model.thumbnail_url, join(output, "character-thumbnail.png"));
    state.creating = "rig";
    await saveState(checkpoint, state);
    rigId = await client.create("rigging", {
      input_task_id: modelId,
      height_meters: 1.8,
    });
    state.rig_task_id = rigId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const rig = await client.wait("rigging", rigId, "rig");
  const result = rig.result as RiggingResult;
  await client.download(result.rigged_character_glb_url, join(output, "rigged-character.glb"));
  await client.download(result.rigged_character_fbx_url, join(output, "rigged-character.fbx"));
  await client.download(result.basic_animations.walking_glb_url, join(output, "walking.glb"));
  await client.download(result.basic_animations.running_glb_url, join(output, "running.glb"));
  const credits = model !== undefined
    ? `${model.consumed_credits + rig.consumed_credits} credits total`
    : `${rig.consumed_credits} rig credits; model stage excluded`;
  console.log(`Done: ${join(output, "rigged-character.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const images = args.filter((arg) => arg !== "--resume");
  if (images.length > 1) throw new Error("Usage: npm start -- [--resume] [image.png]");
  await run(images[0], args.includes("--resume"));
}
