import { afterEach, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

const execFile = vi.fn()
vi.mock("node:child_process", () => ({ execFile }))

const {
  MeshyError,
  MissingKeyError,
  createTask,
  getAsset,
  getLibrary,
  getTask,
} = await import("./meshy")

type Done = (error: Error | null, stdout: string) => void

function cliAnswers(envelope: object | Error) {
  execFile.mockImplementation(
    (_file: string, _args: string[], _options: object, done: Done) => {
      if (envelope instanceof Error) done(envelope, "")
      else done(null, JSON.stringify(envelope))
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  execFile.mockReset()
})

test("without a key, every Meshy call asks for one and sends nothing", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  await expect(
    createTask({ kind: "preview", prompt: "A knight" }),
  ).rejects.toBeInstanceOf(MissingKeyError)
  await expect(getTask("preview", "task-1")).rejects.toBeInstanceOf(
    MissingKeyError,
  )
  await expect(getAsset("rig", "task-1", "model")).rejects.toBeInstanceOf(
    MissingKeyError,
  )
  await expect(getLibrary()).rejects.toBeInstanceOf(MissingKeyError)
  expect(fetch).not.toHaveBeenCalled()
})

test("a character's first stage asks Meshy for an A-pose preview", async () => {
  const fetch = vi.fn(async () => Response.json({ result: "task-1" }))
  vi.stubGlobal("fetch", fetch)
  const id = await createTask(
    { kind: "preview", prompt: "A knight" },
    { kind: "key", key: "msy_test" },
  )
  expect(id).toBe("task-1")
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe("https://api.meshy.ai/openapi/v2/text-to-3d")
  expect(JSON.parse(String(init.body))).toEqual({
    mode: "preview",
    prompt: "A knight",
    ai_model: "latest",
    pose_mode: "a-pose",
    should_remesh: true,
    target_polycount: 60000,
  })
})

test("with the CLI's sign-in, the request goes through meshy api without the key", async () => {
  process.env.MESHY_API_KEY = "msy_env"
  cliAnswers({
    ok: true,
    result: { http_status: 202, body: { result: "t-1" } },
  })
  const id = await createTask(
    { kind: "preview", prompt: "A knight" },
    { kind: "cli" },
  )
  delete process.env.MESHY_API_KEY
  expect(id).toBe("t-1")
  const [file, args, options] = execFile.mock.calls[0] as [
    string,
    string[],
    { env: Record<string, string | undefined> },
  ]
  expect(file).toBe("meshy")
  expect(args.slice(0, 4)).toEqual(["api", "POST", "/text-to-3d", "--v2"])
  expect(JSON.parse(args[5]!)).toMatchObject({ mode: "preview" })
  expect(options.env.MESHY_API_KEY).toBeUndefined()
})

test("a Meshy error through the CLI keeps its status", async () => {
  cliAnswers({
    ok: false,
    result: null,
    error: { code: "payment", message: "Not enough credits", http_status: 402 },
  })
  const failure = getTask("rig", "t-1", { kind: "cli" })
  await expect(failure).rejects.toBeInstanceOf(MeshyError)
  await expect(failure).rejects.toMatchObject({ status: 402 })
})

test("without the CLI installed, the page is asked for a key", async () => {
  cliAnswers(Object.assign(new Error("spawn meshy ENOENT"), { code: "ENOENT" }))
  await expect(getLibrary({ kind: "cli" })).rejects.toBeInstanceOf(
    MissingKeyError,
  )
})
