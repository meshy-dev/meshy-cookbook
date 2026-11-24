import { act, renderHook } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import {
  REVEAL,
  enterTransition,
  layers,
  nextPhase,
  settledPhase,
  useReveal,
} from "./reveal"
import type { Character } from "./store"

function character(patch: Partial<Character>): Character {
  return {
    id: "a",
    prompt: "A robot",
    stage: "mesh",
    progress: 0,
    textured: false,
    clips: [],
    ...patch,
  }
}

test("live stage changes pick the cinematic beat, resumes skip it", () => {
  expect(enterTransition("mesh", "texture")).toEqual({
    phase: "scan",
    after: "gray",
    ms: REVEAL.scanMs,
  })
  expect(enterTransition("texture", "rig")).toEqual({
    phase: "dissolve",
    after: "textured",
    ms: REVEAL.dissolveMs,
  })
  expect(enterTransition("rig", "idle")).toEqual({
    phase: "bones",
    after: "textured",
    ms: REVEAL.bonesMs,
  })
  expect(enterTransition("idle", "ready")).toBeNull()
  expect(enterTransition("rig", "ready")).toEqual({
    phase: "bones",
    after: "ready",
    ms: REVEAL.bonesMs,
  })
  expect(enterTransition(undefined, "texture")).toBeNull()
  expect(settledPhase(character({ stage: "texture", modelUrl: "/p" }))).toBe(
    "gray",
  )
  expect(settledPhase(character({ stage: "idle", modelUrl: "/r" }))).toBe(
    "textured",
  )
})

test("dissolve keeps the gray preview under the textured mesh", () => {
  const next = character({
    stage: "rig",
    textured: true,
    previewUrl: "/preview.glb",
    modelUrl: "/refine.glb",
  })
  expect(layers("dissolve", next)).toMatchObject({
    grayUrl: "/preview.glb",
    colorUrl: "/refine.glb",
    wipe: true,
    playClip: false,
  })
  expect(layers("bones", next)).toMatchObject({
    colorUrl: "/refine.glb",
    bones: true,
    playClip: false,
  })
  expect(layers("ready", next)).toMatchObject({
    colorUrl: "/refine.glb",
    playClip: true,
    bones: false,
  })
})

test("scan uses the preview mesh even before textures exist", () => {
  const next = character({
    stage: "texture",
    modelUrl: "/preview.glb",
    previewUrl: "/preview.glb",
  })
  expect(layers("scan", next)).toMatchObject({
    grayUrl: "/preview.glb",
    scan: true,
  })
  expect(layers("scan", next).colorUrl).toBeUndefined()
})

test("nextPhase follows each beat, and ready during bones still finishes it", () => {
  expect(nextPhase("scan")).toBe("gray")
  expect(nextPhase("dissolve")).toBe("textured")
  expect(nextPhase("bones", "idle")).toBe("textured")
  expect(nextPhase("bones", "ready")).toBe("ready")
})

test("a live stage change starts the beat; advance settles it", () => {
  const { result, rerender } = renderHook(({ value }) => useReveal(value), {
    initialProps: { value: character({ stage: "mesh" }) },
  })
  expect(result.current.phase).toBe("build")
  rerender({
    value: character({
      stage: "texture",
      modelUrl: "/p",
      previewUrl: "/p",
    }),
  })
  expect(result.current.phase).toBe("scan")
  expect(result.current.layers?.scan).toBe(true)
  act(() => result.current.advance("scan"))
  expect(result.current.phase).toBe("gray")
})

test("hydrated characters skip intros", () => {
  const { result } = renderHook(() =>
    useReveal(
      character({
        stage: "rig",
        textured: true,
        modelUrl: "/r",
        previewUrl: "/p",
      }),
    ),
  )
  expect(result.current.phase).toBe("textured")
  expect(result.current.layers?.wipe).toBe(false)
})

test("ready during bones does not cancel the skeleton beat", () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ value }) => useReveal(value), {
    initialProps: {
      value: character({
        stage: "rig",
        textured: true,
        modelUrl: "/r",
      }),
    },
  })
  rerender({
    value: character({ stage: "idle", textured: true, modelUrl: "/r" }),
  })
  expect(result.current.phase).toBe("bones")
  rerender({
    value: character({ stage: "ready", textured: true, modelUrl: "/r" }),
  })
  expect(result.current.phase).toBe("bones")
  expect(result.current.layers?.playClip).toBe(false)
  act(() => result.current.advance("bones"))
  expect(result.current.phase).toBe("ready")
  expect(result.current.layers?.playClip).toBe(true)
  vi.useRealTimers()
})
