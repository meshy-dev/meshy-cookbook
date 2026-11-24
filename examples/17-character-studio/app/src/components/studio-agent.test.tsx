import { cleanup, render, screen } from "@testing-library/react"
import { createAgent } from "@ui-sdk/react/agent"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { generateCharacter, generateMotion } from "@/lib/pipeline"
import { useStudio } from "@/lib/store"
import { testLibrary } from "@/test/library"
import { CreatePanel } from "./create-panel"
import { DirectorPanel } from "./director-panel"
import { KeysDialog } from "./keys-dialog"

vi.mock("@/lib/pipeline", async () => {
  const { useStudio } = await import("@/lib/store")
  return {
    generateCharacter: vi.fn(),
    loadConfig: vi.fn(),
    generateMotion: vi.fn(),
    playAnimation: vi.fn((id: string) =>
      useStudio.getState().set({ animation: id, clip: id }),
    ),
  }
})

const agent = createAgent()

const CONTROLS = [
  "Character prompt",
  "Generate character",
  "Animation",
  "Play",
  "Speed",
  "Motion prompt",
  "Generate motion",
  "Camera",
  "Auto-rotate",
  "Finish",
  "Tint",
  "Backdrop",
  "Skeleton",
]

beforeEach(() => {
  vi.mocked(generateCharacter).mockClear()
  vi.mocked(generateMotion).mockClear()
  useStudio.setState({
    meshyAvailable: true,
    library: testLibrary,
    activeId: "robot",
    animation: "0",
    clip: "0",
    characters: [
      {
        id: "robot",
        prompt: "A test robot",
        stage: "ready",
        progress: 100,
        textured: true,
        rigTaskId: "rig",
        modelUrl: "/api/meshy/asset/rig/rig?file=model",
        clips: testLibrary.map((item) => ({
          id: item.id,
          name: item.name,
          url: `/api/meshy/asset/animate/${item.id}?file=animation`,
        })),
      },
    ],
  })
  render(
    <>
      <KeysDialog />
      <CreatePanel />
      <DirectorPanel />
    </>,
  )
})

afterEach(cleanup)

test("an agent can find every studio control by name", () => {
  const components = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of components) {
    expect(
      entry.label,
      `${entry.component} ${entry.ref} has no name`,
    ).toBeTruthy()
  }
  const labels = components.map((entry) => entry.label)
  for (const label of CONTROLS) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label)
  }
})

test("an agent can direct the scene", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Camera", action: "setValue", args: ["Face"] },
      { ref: "Animation", action: "setValue", args: ["Dance"] },
      { ref: "Finish", action: "setValue", args: ["Metal"] },
      { ref: "Tint", action: "setValue", args: ["#f5c542"] },
      { ref: "Backdrop", action: "setValue", args: ["Night"] },
      { ref: "Speed", action: "setValue", args: [1.5] },
      { ref: "Auto-rotate", action: "setChecked", args: [true] },
      { ref: "Skeleton", action: "setChecked", args: [true] },
      { ref: "Play", action: "setPressed", args: [false] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(useStudio.getState()).toMatchObject({
    camera: "face",
    animation: "22",
    finish: "metal",
    tint: "#f5c542",
    backdrop: "night",
    speed: 1.5,
    autoRotate: true,
    skeleton: true,
    playing: false,
  })
})

test("an agent can't see or open the API keys", async () => {
  const labels = agent.snapshot().map((entry) => entry.label ?? "")
  expect(labels.filter((label) => /key/i.test(label))).toEqual([])

  const result = await agent.act({
    steps: [{ ref: "API keys", action: "press" }],
  })
  expect(result.ok).toBe(false)
  expect(screen.queryByText("Your API keys")).toBeNull()
})

test("deleting a character needs a person", async () => {
  const result = await agent.act({
    steps: [{ ref: "Delete A test robot", action: "press" }],
  })
  expect(result.ok).toBe(false)
  expect(useStudio.getState().characters).toHaveLength(1)
})

test("generating a character needs a person", async () => {
  const result = await agent.act({
    steps: [
      {
        ref: "Character prompt",
        action: "setValue",
        args: ["A knight in toy armor"],
      },
      { ref: "Generate character", action: "press" },
    ],
  })
  expect(result.ok).toBe(false)
  expect(generateCharacter).not.toHaveBeenCalled()
})

test("generating motion needs a person", async () => {
  const result = await agent.act({
    steps: [
      {
        ref: "Motion prompt",
        action: "setValue",
        args: ["A slow theatrical bow"],
      },
      { ref: "Generate motion", action: "press" },
    ],
  })
  expect(result.ok).toBe(false)
  expect(generateMotion).not.toHaveBeenCalled()
})

test("an expired character is marked so it can be cleared", async () => {
  useStudio.getState().upsert("robot", { expired: true })
  expect(await screen.findByText("Expired")).toBeTruthy()
})
