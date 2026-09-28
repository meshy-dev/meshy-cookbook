// Build a textured prop from one image, then convert it into a multi-color 3MF for a multi-filament printer.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_IMAGE = join(DIRECTORY, "../input/sea-chest.png");
const SAMPLE_STYLE = "realistic";
const STYLES = ["realistic", "cartoon"] as const;
const OUTPUT = join(DIRECTORY, "output");

type Style = (typeof STYLES)[number];

interface RunState {
  version: 1;
  image: string;
  style: Style;
  model_task_id: string | null;
  print_task_id: string | null;
  creating: "model" | "print" | null;
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

const validStyle = (value: unknown): value is Style => (STYLES as readonly unknown[]).includes(value);

async function loadState(path: string, image?: string, style?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "image", "style", "model_task_id", "print_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  if (!validStyle(state.style)) throw new Error("Invalid style in run.json");
  for (const key of ["model_task_id", "print_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.print_task_id && !state.model_task_id) throw new Error("run.json has a print task without a model task");
  if (![null, "model", "print"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (style !== undefined && style !== state.style) throw new Error("Style differs from run.json; resume with its original style");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(image?: string, style?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (style !== undefined && !validStyle(style)) throw new Error("Style must be realistic or cartoon");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, image, style); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, image: image ?? SAMPLE_IMAGE, style: style ?? SAMPLE_STYLE, model_task_id: null, print_task_id: null, creating: null };
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
      enable_pbr: false,
      target_formats: ["glb"],
    });
    state.model_task_id = modelId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let model: Task | undefined;
  let printId = state.print_task_id;
  if (printId === null) {
    model = await client.wait("image-to-3d", modelId, "model");
    await client.download(model.model_urls.glb, join(output, "textured-model.glb"));
    await client.download(model.thumbnail_url, join(output, "textured-model-thumbnail.png"));
    state.creating = "print";
    await saveState(checkpoint, state);
    printId = await client.create("print/multi-color", {
      input_task_id: modelId,
      max_colors: 4,
      style: state.style,
    });
    state.print_task_id = printId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("print/multi-color", printId, "print");
  await client.download(task.model_urls["3mf"]!, join(output, "multi-color-print.3mf"));
  const credits = model !== undefined
    ? `${model.consumed_credits + task.consumed_credits} credits total`
    : `${task.consumed_credits} print credits; model stage excluded`;
  console.log(`Done: ${join(output, "multi-color-print.3mf")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 2) throw new Error("Usage: npm start -- [--resume] [image.png] [style]");
  await run(positional[0], positional[1], args.includes("--resume"));
}
