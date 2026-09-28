// Build a mesh from one image, check it for printing, then split it into parts laid out on the build plate, as a 3MF.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type Printability, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE = join(DIRECTORY, "../input/concept-art.png");
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  image: string;
  model_task_id: string | null;
  split_task_id: string | null;
  creating: "model" | "split" | null;
}

/** Atomically checkpoint only the input and task IDs, never signed URLs or keys. */
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
  const keys = ["version", "image", "model_task_id", "split_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  for (const key of ["model_task_id", "split_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.split_task_id && !state.model_task_id) throw new Error("run.json has a split task without a model task");
  if (![null, "model", "split"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
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
    state = { version: 1, image: image ?? SAMPLE, model_task_id: null, split_task_id: null, creating: null };
  }
  const imageUrl = state.model_task_id === null ? await Meshy.dataUri(state.image) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let modelId = state.model_task_id;
  if (modelId === null) {
    state.creating = "model";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    modelId = await client.create("image-to-3d", {
      image_url: imageUrl,
      should_texture: false,
      target_formats: ["glb"],
    });
    state.model_task_id = modelId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let model: Task | undefined;
  let splitId = state.split_task_id;
  if (splitId === null) {
    model = await client.wait("image-to-3d", modelId, "model");
    await client.download(model.thumbnail_url, join(output, "model-thumbnail.png"));
    // The printability check is free, so a resumed run repeats it instead of checkpointing it.
    const checkId = await client.create("print/analyze", { input_task_id: modelId });
    const check = await client.wait("print/analyze", checkId, "check");
    const printability = check.printability as Printability;
    await writeFile(join(output, "printability.json"), `${JSON.stringify(printability, null, 2)}\n`);
    const metrics = printability.metrics;
    console.log(
      `Printability ${printability.status}: watertight ${metrics.is_watertight ? "yes" : "no"}, `
      + `${metrics.holes} holes, ${metrics.non_manifold_edges} non-manifold edges, ${metrics.degenerate_faces} degenerate faces`,
    );
    state.creating = "split";
    await saveState(checkpoint, state);
    splitId = await client.create("print/split", {
      input_task_id: modelId,
      target_formats: ["glb", "3mf"],
      layout: "on_plate",
    });
    state.split_task_id = splitId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("print/split", splitId, "split");
  await client.download(task.model_urls["3mf"]!, join(output, "printable-parts.3mf"));
  await client.download(task.model_urls.glb, join(output, "printable-parts.glb"));
  await client.download(task.thumbnail_url, join(output, "printable-parts-thumbnail.png"));
  const credits = model !== undefined
    ? `${model.consumed_credits + task.consumed_credits} credits total`
    : `${task.consumed_credits} split credits; model stage excluded`;
  console.log(`Done: ${join(output, "printable-parts.3mf")}  (${task.part_count} parts, ${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 1) throw new Error("Usage: npm start -- [--resume] [image.png]");
  await run(positional[0], args.includes("--resume"));
}
