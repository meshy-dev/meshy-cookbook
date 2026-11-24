import { expect, test } from "vitest"
import { isBuilding, stageModelUrl, stageView } from "./stage-view"
import type { Character } from "./store"

function character(patch: Partial<Character>): Character {
  return {
    id: "a",
    prompt: "A robot",
    stage: "ready",
    progress: 100,
    textured: true,
    clips: [],
    ...patch,
  }
}

test("an expired character is not loaded onto the stage", () => {
  const expired = character({
    expired: true,
    modelUrl: "/api/meshy/asset/rig/old?file=model",
  })
  expect(stageView(expired)).toBe("expired")
  expect(stageModelUrl(expired)).toBeUndefined()
  expect(isBuilding(expired)).toBe(false)
})

test("a failed rig still shows the textured mesh", () => {
  const failed = character({
    stage: "failed",
    error: "Rigging failed",
    modelUrl: "/api/meshy/asset/refine/tex?file=model",
    textured: true,
  })
  expect(stageView(failed)).toBe("failed-model")
  expect(stageModelUrl(failed)).toBe("/api/meshy/asset/refine/tex?file=model")
  expect(isBuilding(failed)).toBe(false)
})

test("a mesh still generating shows the build view", () => {
  expect(
    stageView(
      character({
        stage: "mesh",
        progress: 40,
        textured: false,
        modelUrl: undefined,
      }),
    ),
  ).toBe("build")
})

test("a failed mesh with nothing to show is empty of a model", () => {
  const failed = character({
    stage: "failed",
    error: "Preview failed",
    modelUrl: undefined,
  })
  expect(stageView(failed)).toBe("failed")
  expect(stageModelUrl(failed)).toBeUndefined()
})
