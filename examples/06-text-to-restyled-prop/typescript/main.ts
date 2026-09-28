// Restyle the gray low-poly oak with a text prompt into a textured GLB with PBR maps.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_PROMPT =
  "An oak tree in autumn: rough dark brown bark with deep vertical grooves on the trunk, " +
  "dense orange and gold leaves on the canopy. Stylized hand-painted game prop.";
const SAMPLE_IMAGE = join(DIRECTORY, "../input/low-poly-oak.png");
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  prompt: string;
  image: string;
  model_task_id: string | null;
  retexture_task_id: string | null;
  creating: "model" | "retexture" | null;
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

async function loadState(path: string, prompt?: string, image?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "prompt", "image", "model_task_id", "retexture_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.prompt !== "string" || !state.prompt.trim()) throw new Error("Invalid prompt in run.json");
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  for (const key of ["model_task_id", "retexture_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.retexture_task_id && !state.model_task_id) throw new Error("run.json has a retexture task without a model task");
  if (![null, "model", "retexture"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (prompt !== undefined && prompt !== state.prompt) throw new Error("Prompt differs from run.json; resume with its original prompt");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(prompt?: string, image?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (prompt !== undefined && !prompt.trim()) throw new Error("Style prompt cannot be empty");
  if (prompt !== undefined && prompt.length > 800) throw new Error("Style prompt must be 800 characters or fewer");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, prompt, image); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, prompt: prompt ?? SAMPLE_PROMPT, image: image ?? SAMPLE_IMAGE, model_task_id: null, retexture_task_id: null, creating: null };
  }
  const imageUrl = state.model_task_id === null ? await Meshy.dataUri(state.image) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let modelId = state.model_task_id;
  if (modelId === null) {
    state.creating = "model";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    modelId = await client.create("image-to-3d", {
      image_url: imageUrl,
      model_type: "smart-topology",
      target_polycount: 1000,
      should_texture: false,
      target_formats: ["glb"],
    });
    state.model_task_id = modelId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let model: Task | undefined;
  let retextureId = state.retexture_task_id;
  if (retextureId === null) {
    model = await client.wait("image-to-3d", modelId, "model");
    await client.download(model.thumbnail_url, join(output, "low-poly-prop-thumbnail.png"));
    state.creating = "retexture";
    await saveState(checkpoint, state);
    retextureId = await client.create("retexture", {
      input_task_id: modelId,
      text_style_prompt: state.prompt,
      enable_original_uv: false,
      enable_pbr: true,
      target_formats: ["glb"],
    });
    state.retexture_task_id = retextureId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("retexture", retextureId, "retexture");
  await client.download(task.model_urls.glb, join(output, "restyled-prop.glb"));
  await client.download(task.thumbnail_url, join(output, "restyled-prop-thumbnail.png"));
  const textures = task.texture_urls![0];
  await client.download(textures.base_color, join(output, "base-color.png"));
  await client.download(textures.metallic, join(output, "metallic.png"));
  await client.download(textures.roughness, join(output, "roughness.png"));
  await client.download(textures.normal, join(output, "normal.png"));
  const credits = model !== undefined
    ? `${model.consumed_credits + task.consumed_credits} credits total`
    : `${task.consumed_credits} retexture credits; model stage excluded`;
  console.log(`Done: ${join(output, "restyled-prop.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 2) throw new Error('Usage: npm start -- [--resume] ["style prompt"] [image.png]');
  await run(positional[0], positional[1], args.includes("--resume"));
}
