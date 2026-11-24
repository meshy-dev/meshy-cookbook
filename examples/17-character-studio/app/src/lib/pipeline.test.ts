import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { testLibrary } from "@/test/library"
import { generateCharacter, resumeJobs } from "./pipeline"
import { useStudio } from "./store"
import type { CreateTaskInput, TaskKind, TaskState } from "./types"

vi.mock("@ui-sdk/react/toast", () => ({ toast: vi.fn() }))

const posts: CreateTaskInput[] = []
const gets: { kind: string; id: string }[] = []

function ok(data: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  } as Response)
}

beforeEach(() => {
  posts.length = 0
  gets.length = 0
  localStorage.clear()
  useStudio.setState({
    characters: [],
    activeId: null,
    pendingMotion: undefined,
    library: testLibrary,
  })
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "POST" && url.includes("/api/meshy/tasks")) {
        const body = JSON.parse(String(init.body)) as CreateTaskInput
        posts.push(body)
        return ok({ id: `${body.kind}-new` })
      }
      const match = url.match(/\/api\/meshy\/tasks\/(\w+)\/([^/?]+)/)
      if (match) {
        const kind = match[1] as TaskKind
        const id = match[2]!
        gets.push({ kind, id })
        const task: TaskState = {
          id,
          kind,
          status: "SUCCEEDED",
          progress: 100,
          retryAfter: 0,
          modelUrl: `/m/${id}`,
        }
        if (kind === "rig") {
          task.clips = [{ id: "Walk", name: "Walk", url: "/c/walk" }]
        }
        if (kind === "animate") {
          task.clips = [{ id, name: "Idle", url: "/c/idle" }]
        }
        return ok(task)
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "unexpected" }),
      } as Response)
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test("generateCharacter records each task id as it goes", async () => {
  await generateCharacter("A cheerful robot")
  const character = useStudio.getState().characters[0]
  expect(character?.stage).toBe("ready")
  expect(character?.previewTaskId).toBe("preview-new")
  expect(character?.refineTaskId).toBe("refine-new")
  expect(character?.rigTaskId).toBe("rig-new")
  expect(character?.idleTaskId).toBe("animate-new")
  expect(character?.previewUrl).toBe("/m/preview-new")
  expect(character?.modelUrl).toBe("/m/rig-new")
  expect(posts.map((item) => item.kind)).toEqual([
    "preview",
    "refine",
    "rig",
    "animate",
  ])
})

test("resumeJobs polls an in-progress task instead of starting over", async () => {
  useStudio.setState({
    characters: [
      {
        id: "resume-me",
        prompt: "A fox ranger",
        stage: "texture",
        progress: 20,
        textured: false,
        clips: [],
        previewTaskId: "prev-1",
        task: { kind: "refine", id: "ref-1" },
      },
    ],
    activeId: "resume-me",
    library: testLibrary,
  })
  await resumeJobs()
  expect(posts.map((item) => item.kind)).toEqual(["rig", "animate"])
  expect(gets[0]).toEqual({ kind: "refine", id: "ref-1" })
  const character = useStudio.getState().characters[0]
  expect(character?.stage).toBe("ready")
  expect(character?.refineTaskId).toBe("ref-1")
})
