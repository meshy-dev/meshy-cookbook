// Turn character concept art into a rigged character with idle, jump and attack clips in one file.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, type AnimationResult, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE = join(DIRECTORY, "../input/concept-art.png");
const ACTIONS = [0, 466, 4]; // Idle, Regular Jump and Attack in the animation library
const OUTPUT = join(DIRECTORY, "output");
const STAGES = ["model", "rig", "animation"] as const;

interface RunState {
  version: 1;
  image: string;
  actions: number[];
  model_task_id: string | null;
  rig_task_id: string | null;
  animation_task_id: string | null;
  creating: "model" | "rig" | "animation" | null;
}

/** One to ten different action ids from the animation library, as non-negative integers. */
function validActions(actions: unknown): actions is number[] {
  return Array.isArray(actions) && actions.length >= 1 && actions.length <= 10
    && actions.every((action) => Number.isInteger(action) && action >= 0)
    && new Set(actions).size === actions.length;
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

async function loadState(path: string, image?: string, actions?: number[]): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "image", "actions", "model_task_id", "rig_task_id", "animation_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.image !== "string" || !state.image) throw new Error("Invalid image in run.json");
  if (!validActions(state.actions)) throw new Error("Invalid actions in run.json");
  const ids = STAGES.map((stage) => state[`${stage}_task_id`]);
  for (const [index, stage] of STAGES.entries()) {
    if (ids[index] !== null && (typeof ids[index] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(ids[index]))) throw new Error(`Invalid ${stage}_task_id in run.json`);
  }
  if (ids.some((id, index) => index > 0 && id && !ids[index - 1])) throw new Error("run.json has a later stage without the stage before it");
  if (![null, ...STAGES].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (image !== undefined && image !== state.image) throw new Error("Image differs from run.json; resume with its original image");
  if (actions !== undefined && JSON.stringify(actions) !== JSON.stringify(state.actions)) throw new Error("Actions differ from run.json; resume with its original actions");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(actions?: number[], image?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (actions !== undefined && !validActions(actions)) throw new Error("Actions must be one to ten different action ids from the animation library");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, image, actions); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, image: image ?? SAMPLE, actions: actions ?? ACTIONS, model_task_id: null, rig_task_id: null, animation_task_id: null, creating: null };
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
  let rig: Task | undefined;
  let animationId = state.animation_task_id;
  if (animationId === null) {
    rig = await client.wait("rigging", rigId, "rig");
    state.creating = "animation";
    await saveState(checkpoint, state);
    animationId = await client.create("animations", {
      rig_task_id: rigId,
      action_ids: state.actions,
    });
    state.animation_task_id = animationId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const animation = await client.wait("animations", animationId, "animation");
  const result = animation.result as AnimationResult;
  await client.download(result.animation_glb_url, join(output, "animated-character.glb"));
  await client.download(result.animation_fbx_url, join(output, "animated-character.fbx"));
  const credits = model !== undefined && rig !== undefined
    ? `${model.consumed_credits + rig.consumed_credits + animation.consumed_credits} credits total`
    : rig !== undefined
      ? `${rig.consumed_credits + animation.consumed_credits} credits for rig and animation; model stage excluded`
      : `${animation.consumed_credits} animation credits; model and rig stages excluded`;
  console.log(`Done: ${join(output, "animated-character.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  const image = positional.length > 0 && !/^\d+$/.test(positional[positional.length - 1]) ? positional.pop() : undefined;
  if (!positional.every((arg) => /^\d+$/.test(arg))) throw new Error("Usage: npm start -- [--resume] [action_id ...] [image.png]");
  await run(positional.length > 0 ? positional.map(Number) : undefined, image, args.includes("--resume"));
}
