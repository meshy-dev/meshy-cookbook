// Turn a text prompt into an Ultra 4K hero prop GLB with 4K textures.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE =
  "Marrow's sea chest, a closed pirate treasure chest: weathered oak planks, " +
  "black iron straps and rivets, a heavy brass padlock, barnacles along the base. " +
  "Stylized hand-painted game prop, three-quarter view.";
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  prompt: string;
  concept_task_id: string | null;
  model_task_id: string | null;
  creating: "concept" | "model" | null;
}

/** Atomically checkpoint only the prompt and task IDs, never signed URLs or keys. */
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

async function loadState(path: string, prompt?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "prompt", "concept_task_id", "model_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.prompt !== "string" || !state.prompt.trim()) throw new Error("Invalid prompt in run.json");
  for (const key of ["concept_task_id", "model_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.model_task_id && !state.concept_task_id) throw new Error("run.json has a model task without a concept task");
  if (![null, "concept", "model"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (prompt !== undefined && prompt !== state.prompt) throw new Error("Description differs from run.json; resume with its original description");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(prompt?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (prompt !== undefined && !prompt.trim()) throw new Error("Description cannot be empty");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, prompt); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, prompt: prompt ?? SAMPLE, concept_task_id: null, model_task_id: null, creating: null };
  }
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let conceptId = state.concept_task_id;
  if (conceptId === null) {
    state.creating = "concept";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    conceptId = await client.create("text-to-image", {
      ai_model: "gpt-image-2-5-sunburst",
      prompt: state.prompt,
      remove_background: true,
    });
    state.concept_task_id = conceptId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let conceptCredits: number | undefined;
  let taskId = state.model_task_id;
  if (taskId === null) {
    const concept = await client.wait("text-to-image", conceptId);
    await client.download(concept.image_urls[0], join(output, "hero-prop-concept.png"));
    conceptCredits = concept.consumed_credits;
    state.creating = "model";
    await saveState(checkpoint, state);
    taskId = await client.create("image-to-3d", {
      input_task_id: conceptId,
      geometry_resolution: "4k",
      should_texture: true,
      enable_pbr: true,
      texture_resolution: "4k",
      target_formats: ["glb"],
    });
    state.model_task_id = taskId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("image-to-3d", taskId);
  await client.download(task.model_urls.glb, join(output, "hero-prop.glb"));
  await client.download(task.thumbnail_url, join(output, "hero-prop-thumbnail.png"));
  const credits = conceptCredits !== undefined
    ? `${conceptCredits + task.consumed_credits} credits total`
    : `${task.consumed_credits} model credits; concept stage excluded`;
  console.log(`Done: ${join(output, "hero-prop.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const description = args.filter((arg) => arg !== "--resume");
  await run(description.length ? description.join(" ") : undefined, args.includes("--resume"));
}
