// Minimal Meshy API client: create a task, poll it, download the result.
// Copy this file into your own project. Node 22+, native fetch, no dependencies.

import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "https://api.meshy.ai/openapi";
const VERSIONS: Record<string, string> = { "text-to-3d": "v2" }; // every other endpoint is served under v1
const POLL_MS = 5_000;
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** `result` of a rigging task: the rigged files and the free walking and running clips. */
export interface RiggingResult {
  rigged_character_glb_url: string;
  rigged_character_fbx_url: string;
  basic_animations: { walking_glb_url: string; running_glb_url: string };
}

/** `result` of an animation task: one file with one clip per requested action. */
export interface AnimationResult {
  animation_glb_url: string;
  animation_fbx_url: string;
}

/** `printability` of an analyze-printability task: what a slicer checks before printing. */
export interface Printability {
  status: string;
  issue_count: number;
  error_count: number;
  warning_count: number;
  metrics: { is_watertight: boolean; volume: number; non_manifold_edges: number; degenerate_faces: number; holes: number };
}

/** The task fields the cookbook reads. Not a full API typing. */
export interface Task {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  model_urls: { glb: string; fbx?: string; usdz?: string; [format: string]: string | undefined }; // 3D tasks
  thumbnail_url: string; // 3D tasks
  thumbnail_urls?: Record<"front" | "right" | "back" | "left", string>; // 3D tasks, when multi_view_thumbnails was requested
  texture_urls?: { base_color: string; metallic: string; roughness: string; normal: string }[]; // textured 3D tasks; the PBR maps when enable_pbr was requested
  image_urls: string[]; // text-to-image tasks
  result?: RiggingResult | AnimationResult; // rigging and animation tasks
  part_count?: number; // print-split tasks
  printability?: Printability | null; // print-analyze tasks; null until SUCCEEDED
  task_error?: { message: string };
  consumed_credits: number;
  ai_model?: string;
}

/** Non-2xx response from the Meshy API. Carries `status` and `body`. */
export class MeshyAPIError extends Error {
  constructor(public status: number, public body: string) {
    super(`Meshy API returned ${status}: ${body}`);
    this.name = "MeshyAPIError";
  }
}

/** Task ended FAILED or CANCELED. Carries the task and `task_error.message`. */
export class MeshyTaskError extends Error {
  constructor(public task: Task) {
    super(`Task ${task.id} ${task.status}: ${task.task_error?.message || task.status}`);
    this.name = "MeshyTaskError";
  }
}

/** Task still PENDING or IN_PROGRESS when `wait` hit its timeout. Carries the task. */
export class MeshyTimeoutError extends Error {
  constructor(public task: Task, timeoutMs: number) {
    super(`Task ${task.id} still ${task.status} after ${timeoutMs / 1000} s`);
    this.name = "MeshyTimeoutError";
  }
}

/** Thin client over POST /<endpoint>, GET /<endpoint>/:id, and result downloads. */
export class Meshy {
  private readonly headers: Record<string, string>;

  /** Use `apiKey`, or MESHY_API_KEY from the environment or ./.env. */
  constructor(apiKey?: string, envFile = ".env") {
    try {
      process.loadEnvFile(envFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // No .env file here; rely on the environment.
    }
    const key = apiKey ?? process.env.MESHY_API_KEY;
    if (!key) throw new Error("MESHY_API_KEY is not set. Copy .env.example to .env and paste your key.");
    this.headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  }

  /** The endpoint's URL: text-to-3d is under /openapi/v2, everything else under /openapi/v1. */
  static url(endpoint: string): string {
    return `${BASE_URL}/${VERSIONS[endpoint] ?? "v1"}/${endpoint}`;
  }

  /** POST `payload` to /<endpoint>; print and return the task id. Retries 429 three times. */
  async create(endpoint: string, payload: Record<string, unknown>): Promise<string> {
    // A slow answer still creates a paid task, so wait long before giving up.
    const post = () =>
      fetch(Meshy.url(endpoint), { method: "POST", headers: this.headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(180_000) });
    let res = await post();
    for (let attempt = 0; attempt < 3 && res.status === 429; attempt++) {
      await sleep(1000 * 2 ** attempt);
      res = await post();
    }
    if (!res.ok) throw new MeshyAPIError(res.status, await res.text());
    const taskId = ((await res.json()) as { result: string }).result;
    console.log(`Created ${endpoint} task ${taskId}`);
    return taskId;
  }

  /** GET /<endpoint>/<taskId> and return the task object. */
  async get(endpoint: string, taskId: string): Promise<Task> {
    const res = await fetch(`${Meshy.url(endpoint)}/${taskId}`, { headers: this.headers, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new MeshyAPIError(res.status, await res.text());
    return (await res.json()) as Task;
  }

  /**
   * Poll every 5 s, printing progress (prefixed by `label`), until SUCCEEDED.
   * A network error, 429, or 5xx while polling is retried three times, so a blip
   * mid-generation does not lose the task. Throws on FAILED/CANCELED/timeout.
   */
  async wait(endpoint: string, taskId: string, label = "", timeoutMs = 1_800_000): Promise<Task> {
    const deadline = Date.now() + timeoutMs;
    const prefix = label ? `${label} ` : "";
    let last = "";
    let failures = 0;
    for (;;) {
      let task: Task;
      try {
        task = await this.get(endpoint, taskId);
        failures = 0;
      } catch (error) {
        const transient = !(error instanceof MeshyAPIError) || error.status === 429 || error.status >= 500;
        if (!transient || ++failures > 3) throw error;
        console.log(`  ${prefix}poll failed, retrying (${(error as Error).name})`);
        await sleep(POLL_MS);
        continue;
      }
      const state = `  ${prefix}${task.status.padEnd(11)} ${String(task.progress).padStart(3)}%`;
      if (state !== last) {
        console.log(state);
        last = state;
      }
      if (task.status === "SUCCEEDED") return task;
      if (task.status === "FAILED" || task.status === "CANCELED") throw new MeshyTaskError(task);
      if (Date.now() >= deadline) throw new MeshyTimeoutError(task, timeoutMs);
      await sleep(POLL_MS);
    }
  }

  /** Stream to a temporary file, then replace `dest` only after success. */
  async download(url: string, dest: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) }); // signed URL: no auth header
    if (!res.ok) throw new MeshyAPIError(res.status, await res.text());
    await mkdir(dirname(dest), { recursive: true });
    if (!res.body) throw new Error("Download response has no body");
    const temporary = `${dest}.${randomUUID()}.tmp`;
    try {
      await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), createWriteStream(temporary, { flags: "wx" }));
      await rename(temporary, dest);
    } finally {
      await rm(temporary, { force: true });
    }
    return dest;
  }

  /** Encode a local .png/.jpg as a base64 data URI for `image_url` fields. */
  static async dataUri(path: string): Promise<string> {
    const mime = MIME[extname(path).toLowerCase()];
    if (!mime) throw new Error(`Input must be a PNG or JPEG file: ${path}`);
    if (!(await stat(path)).isFile()) throw new Error(`Input is not a file: ${path}`);
    return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
  }
}
