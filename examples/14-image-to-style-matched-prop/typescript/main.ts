// Turn concept art and a one-line prop description into a matching low-poly prop, textured with Meshy N1.

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Meshy, MeshyAPIError, type Task } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE_DESCRIPTION =
  "A wooden signpost with two chunky orange arrow signs pointing left and right, a thick light brown wooden post "
  + "with a rounded top, a few tufts of green grass around its foot, and a square cream stone base";
const SAMPLE_REFERENCE = join(DIRECTORY, "../input/seaside-cottage.png");
const OUTPUT = join(DIRECTORY, "output");
const STAGES = ["concept", "mesh", "texture"] as const;

interface RunState {
  version: 1;
  description: string;
  reference: string;
  concept_task_id: string | null;
  mesh_task_id: string | null;
  texture_task_id: string | null;
  creating: "concept" | "mesh" | "texture" | null;
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

/** Mark `stage` as being created, then POST; clear the mark if the API refuses the POST, which creates no task. */
async function createStage(path: string, state: RunState, stage: NonNullable<RunState["creating"]>, post: () => Promise<string>): Promise<string> {
  state.creating = stage;
  await saveState(path, state); // if POST is interrupted, do not blindly repeat it
  try {
    return await post();
  } catch (error) {
    if (error instanceof MeshyAPIError && error.refused) {
      state.creating = null;
      await saveState(path, state);
    }
    throw error;
  }
}

async function loadState(path: string, description?: string, reference?: string): Promise<RunState> {
  const state = JSON.parse(await readFile(path, "utf8"));
  const keys = ["version", "description", "reference", "concept_task_id", "mesh_task_id", "texture_task_id", "creating"].sort();
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(keys) || state.version !== 1) {
    throw new Error("Invalid run.json schema; expected a version 1 checkpoint");
  }
  if (typeof state.description !== "string" || !state.description.trim()) throw new Error("Invalid description in run.json");
  if (typeof state.reference !== "string" || !state.reference) throw new Error("Invalid reference in run.json");
  const ids = STAGES.map((stage) => state[`${stage}_task_id`]);
  for (const [index, stage] of STAGES.entries()) {
    if (ids[index] !== null && (typeof ids[index] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(ids[index]))) throw new Error(`Invalid ${stage}_task_id in run.json`);
  }
  if (ids.some((id, index) => index > 0 && id && !ids[index - 1])) throw new Error("run.json has a later stage without the stage before it");
  if (![null, ...STAGES].includes(state.creating)) throw new Error("Invalid creating marker in run.json");
  if (description !== undefined && description !== state.description) throw new Error("Description differs from run.json; resume with its original description");
  if (reference !== undefined && reference !== state.reference) throw new Error("Reference image differs from run.json; resume with its original image");
  if (state.creating !== null) {
    throw new Error(`Creation outcome for ${state.creating} is unknown. Check Meshy task history, recover its task ID in run.json, and set creating to null before resuming. No new task was created by this resume attempt.`);
  }
  return state as RunState;
}

export async function run(description?: string, reference?: string, resume = false, output = OUTPUT, client?: Pick<Meshy, "create" | "wait" | "download">): Promise<void> {
  if (description !== undefined && !description.trim()) throw new Error("Description cannot be empty");
  const checkpoint = join(output, "run.json");
  let state: RunState;
  if (resume) {
    state = await loadState(checkpoint, description, reference); // validate before opening a client
  } else {
    try {
      await stat(checkpoint);
      throw new Error("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    state = { version: 1, description: description ?? SAMPLE_DESCRIPTION, reference: reference ?? SAMPLE_REFERENCE, concept_task_id: null, mesh_task_id: null, texture_task_id: null, creating: null };
  }
  const referenceUrl = state.concept_task_id === null ? await Meshy.dataUri(state.reference) : undefined;
  client ??= new Meshy(); // reads MESHY_API_KEY from .env

  let conceptId = state.concept_task_id;
  if (conceptId === null) {
    conceptId = await createStage(checkpoint, state, "concept", () => client.create("image-to-image", {
      ai_model: "gpt-image-2-5-sunburst",
      prompt:
        `${state.description}, full object, three-quarter front view, centered with space around it, `
        + "painted in the same art style, palette and brushwork as the reference image, "
        + "painted highlights and soft shadows, soft even studio lighting, plain white background, "
        + "single object, no props, no text",
      reference_image_urls: [referenceUrl],
      aspect_ratio: "1:1",
    }));
    state.concept_task_id = conceptId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let concept: Task | undefined;
  let meshId = state.mesh_task_id;
  if (meshId === null) {
    concept = await client.wait("image-to-image", conceptId, "concept");
    await client.download(concept.image_urls[0], join(output, "prop-concept.png"));
    meshId = await createStage(checkpoint, state, "mesh", () => client.create("image-to-3d", {
      input_task_id: conceptId,
      model_type: "smart-topology",
      ai_model: "meshy-t2.5",
      target_polycount: 5000,
      should_texture: false,
      target_formats: ["glb"],
    }));
    state.mesh_task_id = meshId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  let mesh: Task | undefined;
  let textureId = state.texture_task_id;
  if (textureId === null) {
    mesh = await client.wait("image-to-3d", meshId, "mesh");
    // Retexture takes no image task ID, and the concept's signed link expires, so send the saved file.
    const conceptUrl = await Meshy.dataUri(join(output, "prop-concept.png"));
    textureId = await createStage(checkpoint, state, "texture", () => client.create("retexture", {
      input_task_id: meshId,
      ai_model: "meshy-n1",
      image_style_url: conceptUrl,
      enable_pbr: false,
      target_formats: ["glb"],
    }));
    state.texture_task_id = textureId;
    state.creating = null;
    await saveState(checkpoint, state);
  }
  const texture = await client.wait("retexture", textureId, "texture");
  await client.download(texture.model_urls.glb, join(output, "prop.glb"));
  await client.download(texture.thumbnail_url, join(output, "prop-thumbnail.png"));
  const credits = concept !== undefined && mesh !== undefined
    ? `${concept.consumed_credits + mesh.consumed_credits + texture.consumed_credits} credits total`
    : mesh !== undefined
      ? `${mesh.consumed_credits + texture.consumed_credits} credits for mesh and texture; concept stage excluded`
      : `${texture.consumed_credits} texture credits; concept and mesh stages excluded`;
  console.log(`Done: ${join(output, "prop.glb")}  (${credits})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--resume");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);
  const positional = args.filter((arg) => arg !== "--resume");
  if (positional.length > 2) throw new Error('Usage: npm start -- [--resume] ["prop description"] [concept-art.png]');
  await run(positional[0], positional[1], args.includes("--resume"));
}
