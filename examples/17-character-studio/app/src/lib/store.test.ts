import { beforeEach, expect, test } from "vitest"
import { persistStudio, useStudio } from "./store"

beforeEach(() => {
  localStorage.clear()
  useStudio.setState({
    characters: [],
    activeId: null,
    pendingMotion: undefined,
  })
})

test("persist keeps in-progress task ids so a reload can resume", () => {
  useStudio.getState().upsert("a", {
    prompt: "A robot",
    stage: "texture",
    progress: 40,
    textured: true,
    clips: [],
    previewTaskId: "prev-1",
    task: { kind: "refine", id: "ref-1" },
  })
  const stored = persistStudio(useStudio.getState())
  expect(stored.characters[0]).toMatchObject({
    stage: "texture",
    previewTaskId: "prev-1",
    task: { kind: "refine", id: "ref-1" },
  })
  const raw = localStorage.getItem("character-studio")
  expect(raw).toBeTruthy()
  expect(JSON.parse(raw!).state.characters[0].task).toEqual({
    kind: "refine",
    id: "ref-1",
  })
})

test("persist keeps a failed character's last model", () => {
  useStudio.getState().upsert("a", {
    prompt: "A robot",
    stage: "failed",
    progress: 0,
    textured: true,
    clips: [],
    modelUrl: "/api/meshy/asset/refine/tex?file=model",
    error: "Rigging failed",
  })
  expect(persistStudio(useStudio.getState()).characters[0]).toMatchObject({
    stage: "failed",
    modelUrl: "/api/meshy/asset/refine/tex?file=model",
  })
})

test("persist keeps the gray preview so a textured dissolve can resume", () => {
  useStudio.getState().upsert("a", {
    prompt: "A robot",
    stage: "rig",
    progress: 10,
    textured: true,
    clips: [],
    previewUrl: "/api/meshy/asset/preview/prev?file=model",
    modelUrl: "/api/meshy/asset/refine/tex?file=model",
  })
  expect(persistStudio(useStudio.getState()).characters[0]).toMatchObject({
    previewUrl: "/api/meshy/asset/preview/prev?file=model",
    modelUrl: "/api/meshy/asset/refine/tex?file=model",
  })
})
