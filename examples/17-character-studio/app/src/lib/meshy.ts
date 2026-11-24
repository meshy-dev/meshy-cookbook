import "server-only"
import { CliError, cliRequest } from "./meshy-cli"
import { KEY_HEADER } from "./meshy-headers"
import { resolveMeshyAuth, type MeshyAuth } from "./paid"
import type {
  CreateTaskInput,
  LibraryAnimation,
  TaskKind,
  TaskState,
} from "./types"

const BASE = "https://api.meshy.ai/openapi"

const ENDPOINT: Record<TaskKind, string> = {
  preview: "/v2/text-to-3d",
  refine: "/v2/text-to-3d",
  rig: "/v1/rigging",
  animate: "/v1/animations",
  motion: "/v1/text-to-motion",
}

const KINDS = Object.keys(ENDPOINT) as TaskKind[]

/** How a request reaches Meshy: the person's own key, sent from their
 * browser, the deployment's key when ALLOW_SERVER_MESHY is on, or the Meshy
 * CLI's sign-in on the computer running the app. With none, Meshy calls fail
 * with a 401 that asks for a key. */
function meshyAuth(request: Request) {
  return resolveMeshyAuth(request.headers.get(KEY_HEADER))
}

function isTaskKind(value: string): value is TaskKind {
  return KINDS.includes(value as TaskKind)
}

class MeshyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** No key came with the request, and neither the deployment nor the Meshy CLI
 * can pay for Meshy. */
class MissingKeyError extends MeshyError {
  constructor(
    message = "Add your Meshy API key under API keys to generate characters.",
  ) {
    super(message, 401)
  }
}

function requireAuth(auth: MeshyAuth | undefined): MeshyAuth {
  if (!auth) throw new MissingKeyError()
  return auth
}

async function viaCli(path: string, body?: unknown) {
  try {
    return await cliRequest(body === undefined ? "GET" : "POST", path, body)
  } catch (error) {
    if (!(error instanceof CliError)) throw error
    if (error.status) throw new MeshyError(error.message, error.status)
    throw new MissingKeyError(
      error.code === "not_installed"
        ? "Add your Meshy API key under API keys, or install the Meshy CLI and sign in."
        : "Sign in with the Meshy CLI under API keys, or add your Meshy API key.",
    )
  }
}

/** One Meshy request. Returns the response body and, over HTTP, how long
 * Meshy asks pollers to wait. */
async function meshy(
  auth: MeshyAuth | undefined,
  path: string,
  body?: unknown,
): Promise<{ data: unknown; retryAfter?: number }> {
  const using = requireAuth(auth)
  if (using.kind === "cli") return { data: await viaCli(path, body) }
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${using.key}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    throw new MeshyError(
      error.message ?? `Meshy returned ${response.status}`,
      response.status,
    )
  }
  return {
    data: await response.json(),
    retryAfter: Number(response.headers.get("Retry-After")) || undefined,
  }
}

function requestBody(input: CreateTaskInput) {
  switch (input.kind) {
    case "preview":
      return {
        mode: "preview",
        prompt: input.prompt,
        ai_model: "latest",
        pose_mode: "a-pose",
        should_remesh: true,
        target_polycount: 60000,
      }
    case "refine":
      return {
        mode: "refine",
        preview_task_id: input.previewTaskId,
        enable_pbr: true,
      }
    case "rig":
      return { input_task_id: input.inputTaskId, height_meters: 1.7 }
    case "animate":
      return "motionTaskId" in input
        ? { rig_task_id: input.rigTaskId, motion_task_id: input.motionTaskId }
        : { rig_task_id: input.rigTaskId, action_id: Number(input.actionId) }
    case "motion":
      return { prompt: input.prompt, mode: "prime", duration: input.duration }
  }
}

async function createTask(
  input: CreateTaskInput,
  auth?: MeshyAuth,
): Promise<string> {
  const { data } = await meshy(auth, ENDPOINT[input.kind], requestBody(input))
  return (data as { result: string }).result
}

interface RawTask {
  status: TaskState["status"]
  progress?: number
  task_error?: { message?: string }
  model_urls?: { glb?: string }
  result?: {
    rigged_character_glb_url?: string
    basic_animations?: { walking_glb_url?: string; running_glb_url?: string }
    animation_glb_url?: string
  }
}

async function rawTask(auth: MeshyAuth | undefined, kind: TaskKind, id: string) {
  const { data, retryAfter } = await meshy(
    auth,
    `${ENDPOINT[kind]}/${encodeURIComponent(id)}`,
  )
  return { task: data as RawTask, retryAfter: retryAfter ?? 3 }
}

function assetUrl(kind: TaskKind, id: string, file: string) {
  return `/api/meshy/asset/${kind}/${id}?file=${file}`
}

/** The signed download URL behind one of a task's files. They expire, so the
 * browser only ever sees `assetUrl` and this resolves a fresh one per request. */
function signedUrl(task: RawTask, file: string) {
  switch (file) {
    case "model":
      return task.model_urls?.glb ?? task.result?.rigged_character_glb_url
    case "walking":
      return task.result?.basic_animations?.walking_glb_url
    case "running":
      return task.result?.basic_animations?.running_glb_url
    case "animation":
      return task.result?.animation_glb_url
  }
}

async function getTask(
  kind: TaskKind,
  id: string,
  auth?: MeshyAuth,
): Promise<TaskState> {
  const { task, retryAfter } = await rawTask(auth, kind, id)
  const state: TaskState = {
    id,
    kind,
    status: task.status,
    progress: task.progress ?? 0,
    error: task.task_error?.message || undefined,
    retryAfter,
  }
  if (task.status !== "SUCCEEDED") return state

  if (signedUrl(task, "model")) state.modelUrl = assetUrl(kind, id, "model")
  if (kind === "rig") {
    state.clips = (["walking", "running"] as const)
      .filter((file) => signedUrl(task, file))
      .map((file) => ({
        id: `basic-${file}`,
        name: file === "walking" ? "Walk" : "Run",
        url: assetUrl(kind, id, file),
      }))
  }
  if (kind === "animate" && signedUrl(task, "animation")) {
    state.clips = [{ id, name: "", url: assetUrl(kind, id, "animation") }]
  }
  return state
}

async function getAsset(
  kind: TaskKind,
  id: string,
  file: string,
  auth?: MeshyAuth,
) {
  const { task } = await rawTask(auth, kind, id)
  const url = signedUrl(task, file)
  if (!url) throw new MeshyError("That file isn't available", 404)
  if (new URL(url).hostname !== "assets.meshy.ai") {
    throw new MeshyError("Unexpected asset host", 502)
  }
  return fetch(url, { cache: "no-store" })
}

let library: { at: number; items: LibraryAnimation[] } | undefined

async function getLibrary(auth?: MeshyAuth): Promise<LibraryAnimation[]> {
  const using = requireAuth(auth)
  if (library && Date.now() - library.at < 3_600_000) return library.items
  const { data } = await meshy(using, "/v1/animations/library")
  const raw = data as RawAnimation[] | { result?: RawAnimation[] }
  const list = Array.isArray(raw) ? raw : (raw.result ?? [])
  const items = list
    .filter((item) => item.rig_type === "biped")
    .map((item) => ({
      id: String(item.action_id),
      name: item.name,
      category: item.category,
      previewUrl: item.preview_url,
    }))
  library = { at: Date.now(), items }
  return items
}

interface RawAnimation {
  action_id: number
  name: string
  category: string
  preview_url?: string
  rig_type: string
}

async function getBalance(key: string): Promise<number> {
  const { data } = await meshy({ kind: "key", key }, "/v1/balance")
  return (data as { balance: number }).balance
}

export {
  KEY_HEADER,
  MeshyError,
  MissingKeyError,
  createTask,
  getAsset,
  getBalance,
  getLibrary,
  getTask,
  isTaskKind,
  meshyAuth,
}
