// Turn a description into a textured GLB: a text-to-3d preview mesh, then a refine pass for textures.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_PROMPT =
  "A retro toy rocket ship: a rounded silver body with a red nose cone, three red tail fins, " +
  "a round porthole window on the side, standing upright on its fins. Stylized hand-painted game prop.";
const OUTPUT = join(DIRECTORY, "output");

interface RunState {
  version: 1;
  prompt: string;
  preview_task_id: string | null;
  refine_task_id: string | null;
  creating: "preview" | "refine" | null;
}

/** Atomically checkpoint only the description and task IDs, never signed URLs or keys. */
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
  const keys = ["version", "prompt", "preview_task_id", "refine_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.prompt !== "string" || !state.prompt.trim()) throw new Error("Invalid prompt in run.json");
  for (const key of ["preview_task_id", "refine_task_id"]) {
    if (state[key] !== null && (typeof state[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(state[key]))) throw new Error(`Invalid ${key} in run.json`);
  }
  if (state.refine_task_id && !state.preview_task_id) throw new Error("run.json has a refine task without a preview task");
  if (![null, "preview", "refine"].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (prompt !== undefined && prompt !== state.prompt) throw new Error("Prompt differs from run.json; resume with its original prompt");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(prompt?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (prompt !== undefined && !prompt.trim()) throw new Error("Description cannot be empty");
  if (prompt !== undefined && prompt.length > 800) throw new Error("Description must be 800 characters or fewer");
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
    state = { version: 1, prompt: prompt ?? SAMPLE_PROMPT, preview_task_id: null, refine_task_id: null, creating: null };
  }
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let previewId = state.preview_task_id;
  if (previewId === null) {
    state.creating = "preview";
    await saveState(checkpoint, state); // if POST is interrupted, do not blindly repeat it
    previewId = await client.create("text-to-3d", {
      mode: "preview",
      prompt: state.prompt,
      should_remesh: false,
      target_formats: ["glb"],
    });
    state.preview_task_id = previewId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let preview: Task | undefined;
  let refineId = state.refine_task_id;
  if (refineId === null) {
    preview = await client.wait("text-to-3d", previewId, "preview");
    await client.download(preview.thumbnail_url, join(output, "preview-thumbnail.png"));
    state.creating = "refine";
    await saveState(checkpoint, state);
    refineId = await client.create("text-to-3d", {
      mode: "refine",
      preview_task_id: previewId,
      enable_pbr: true,
      target_formats: ["glb"],
    });
    state.refine_task_id = refineId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const task = await client.wait("text-to-3d", refineId, "refine");
  await client.download(task.model_urls.glb, join(output, "textured-prop.glb"));
  await client.download(task.thumbnail_url, join(output, "textured-prop-thumbnail.png"));
  const credits = preview !== undefined
    ? `${preview.consumed_credits + task.consumed_credits} credits total`
    : `${task.consumed_credits} refine credits; preview stage excluded`;
  console.log(`Done: ${join(output, "textured-prop.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 1) throw new Error('Usage: npm start -- [--resume] ["description"]');
  await run(positional[0], args.includes("--resume"));
}
