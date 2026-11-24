"use client"

import { toast } from "@ui-sdk/react/toast"
import { keyHeaders, useKeys } from "./keys"
import {
  activeCharacter,
  useStudio,
  type Character,
  type PendingMotion,
} from "./store"
import type { Clip, CreateTaskInput, TaskKind, TaskState } from "./types"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const inFlight = new Set<string>()

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...init?.headers, ...keyHeaders() },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? "Request failed")
  return body as T
}

async function createTask(input: CreateTaskInput) {
  const { id } = await api<{ id: string }>("/api/meshy/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return id
}

async function pollTask(
  kind: TaskKind,
  id: string,
  onProgress?: (progress: number) => void,
): Promise<TaskState> {
  for (;;) {
    const task = await api<TaskState>(`/api/meshy/tasks/${kind}/${id}`)
    if (task.status === "SUCCEEDED") return task
    if (task.status === "FAILED" || task.status === "CANCELED") {
      throw new Error(task.error ?? "Meshy couldn't finish this one")
    }
    onProgress?.(task.progress)
    await wait(Math.min(Math.max(task.retryAfter, 0.4), 10) * 1000)
  }
}

async function finishTask(
  input: CreateTaskInput,
  existingId: string | undefined,
  onProgress: (progress: number) => void,
  onId: (id: string) => void,
): Promise<TaskState> {
  const id = existingId ?? (await createTask(input))
  onId(id)
  return pollTask(input.kind, id, onProgress)
}

function currentTaskId(character: Character, kind: TaskKind) {
  if (character.task?.kind === kind) return character.task.id
  switch (kind) {
    case "preview":
      return character.previewTaskId
    case "refine":
      return character.refineTaskId
    case "rig":
      return character.rigTaskId
    case "animate":
      return character.idleTaskId
    case "motion":
      return undefined
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

/** Works out what's live from the deployment's keys and the person's own,
 * and loads the matching animation library. */
async function loadConfig() {
  const [server, library] = await Promise.all([
    api<Studio["server"]>("/api/config"),
    api<Studio["library"]>("/api/meshy/library").catch(() => []),
  ])
  const own = useKeys.getState()
  useStudio.getState().set({
    server,
    meshyAvailable: server.meshy || Boolean(own.meshy),
    agentAvailable: server.agent || Boolean(own.gateway),
    library,
  })
}

type Studio = ReturnType<typeof useStudio.getState>

function characterById(id: string) {
  return useStudio.getState().characters.find((item) => item.id === id)
}

async function generateCharacter(prompt: string, resumeId?: string) {
  const { upsert, set } = useStudio.getState()
  const id = resumeId ?? crypto.randomUUID()
  if (inFlight.has(id)) return
  inFlight.add(id)
  const update = (patch: Partial<Character>) => upsert(id, patch)

  if (!resumeId) {
    update({
      prompt,
      stage: "mesh",
      progress: 0,
      textured: false,
      clips: [],
      expired: false,
      error: undefined,
      modelUrl: undefined,
      previewUrl: undefined,
      previewTaskId: undefined,
      refineTaskId: undefined,
      rigTaskId: undefined,
      idleTaskId: undefined,
      task: undefined,
    })
    set({ activeId: id, animation: null, clip: null })
  }

  try {
    let character = characterById(id)
    if (!character) throw new Error("Character was removed")

    if (character.stage === "mesh") {
      const preview = await finishTask(
        { kind: "preview", prompt: character.prompt },
        currentTaskId(character, "preview"),
        (progress) => update({ progress }),
        (taskId) =>
          update({
            previewTaskId: taskId,
            task: { kind: "preview", id: taskId },
          }),
      )
      update({
        previewTaskId: preview.id,
        modelUrl: preview.modelUrl,
        previewUrl: preview.modelUrl,
        stage: "texture",
        progress: 0,
        task: undefined,
      })
    }

    character = characterById(id)
    if (!character) throw new Error("Character was removed")
    if (character.stage === "texture") {
      if (!character.previewTaskId) {
        throw new Error(
          "The preview task is missing; generate this character again.",
        )
      }
      const refine = await finishTask(
        { kind: "refine", previewTaskId: character.previewTaskId },
        currentTaskId(character, "refine"),
        (progress) => update({ progress }),
        (taskId) =>
          update({
            refineTaskId: taskId,
            task: { kind: "refine", id: taskId },
          }),
      )
      update({
        refineTaskId: refine.id,
        modelUrl: refine.modelUrl,
        textured: true,
        stage: "rig",
        progress: 0,
        task: undefined,
      })
    }

    character = characterById(id)
    if (!character) throw new Error("Character was removed")
    if (character.stage === "rig") {
      if (!character.refineTaskId) {
        throw new Error(
          "The texture task is missing; generate this character again.",
        )
      }
      const rig = await finishTask(
        { kind: "rig", inputTaskId: character.refineTaskId },
        currentTaskId(character, "rig"),
        (progress) => update({ progress }),
        (taskId) =>
          update({ rigTaskId: taskId, task: { kind: "rig", id: taskId } }),
      )
      update({
        modelUrl: rig.modelUrl,
        rigTaskId: rig.id,
        clips: rig.clips ?? [],
        stage: "idle",
        progress: 0,
        task: undefined,
      })
    }

    character = characterById(id)
    if (!character) throw new Error("Character was removed")
    if (character.stage === "idle") {
      const clips = [...character.clips]
      const idle = useStudio
        .getState()
        .library.find((item) => item.name.toLowerCase() === "idle")
      if (idle && !clips.some((clip) => clip.id === idle.id)) {
        if (!character.rigTaskId) {
          throw new Error(
            "The rig task is missing; generate this character again.",
          )
        }
        const task = await finishTask(
          {
            kind: "animate",
            rigTaskId: character.rigTaskId,
            actionId: idle.id,
            name: "Idle",
          },
          currentTaskId(character, "animate"),
          (progress) => update({ progress }),
          (taskId) =>
            update({
              idleTaskId: taskId,
              task: { kind: "animate", id: taskId },
            }),
        )
        const clip = task.clips?.[0]
        if (clip) clips.push({ ...clip, id: idle.id, name: "Idle" })
      }
      update({ clips, stage: "ready", progress: 100, task: undefined })
      if (useStudio.getState().activeId === id) {
        const first = idle?.id ?? clips[0]?.id ?? null
        set({ animation: first, clip: first, playing: true })
      }
      toast("Character ready", { description: character.prompt })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    update({ stage: "failed", error: message, task: undefined })
    toast("Generation failed", { description: message })
  } finally {
    inFlight.delete(id)
  }
}

function addClip(characterId: string, clip: Clip) {
  const { characters, upsert } = useStudio.getState()
  const character = characters.find((item) => item.id === characterId)
  if (!character) return
  upsert(characterId, {
    clips: [...character.clips.filter((item) => item.id !== clip.id), clip],
  })
}

/** Plays a library animation, retargeting it onto the character first if this
 * is the first time it's been asked for. */
async function playAnimation(animationId: string) {
  const state = useStudio.getState()
  const character = activeCharacter(state)
  if (!character?.rigTaskId) return
  if (character.clips.some((clip) => clip.id === animationId)) {
    state.set({ animation: animationId, clip: animationId, playing: true })
    return
  }
  const entry = state.library.find((item) => item.id === animationId)
  if (!entry) return

  state.set({ animation: animationId, loadingAnimation: animationId })
  try {
    const task = await finishTask(
      {
        kind: "animate",
        rigTaskId: character.rigTaskId,
        actionId: animationId,
        name: entry.name,
      },
      undefined,
      () => {},
      () => {},
    )
    const clip = task.clips?.[0]
    if (!clip) throw new Error("Meshy returned no animation file")
    addClip(character.id, { ...clip, id: animationId, name: entry.name })
    const now = useStudio.getState()
    if (now.activeId === character.id && now.animation === animationId) {
      now.set({ clip: animationId, playing: true })
    }
  } catch (error) {
    const now = useStudio.getState()
    if (now.animation === animationId) now.set({ animation: now.clip })
    toast("Couldn't load that animation", {
      description: error instanceof Error ? error.message : undefined,
    })
  } finally {
    useStudio.getState().set({ loadingAnimation: null })
  }
}

async function generateMotion(prompt: string, resume?: PendingMotion) {
  const state = useStudio.getState()
  const character =
    (resume
      ? state.characters.find((item) => item.id === resume.characterId)
      : activeCharacter(state)) ?? null
  if (!character?.rigTaskId) return
  const clipId = resume?.clipId ?? `motion-${crypto.randomUUID()}`
  if (inFlight.has(clipId)) return
  inFlight.add(clipId)
  const pending = (patch: Partial<PendingMotion>): PendingMotion => ({
    characterId: character.id,
    prompt,
    clipId,
    step: resume?.step ?? "motion",
    motionTaskId: resume?.motionTaskId,
    animateTaskId: resume?.animateTaskId,
    ...patch,
  })
  state.set({ loadingAnimation: clipId, pendingMotion: pending({}) })

  try {
    let motionId = resume?.motionTaskId
    if (resume?.step !== "animate") {
      const motion = await finishTask(
        { kind: "motion", prompt, duration: 6 },
        motionId,
        () => {},
        (id) =>
          useStudio.getState().set({
            pendingMotion: pending({ motionTaskId: id, step: "motion" }),
          }),
      )
      motionId = motion.id
      useStudio.getState().set({
        pendingMotion: pending({ motionTaskId: motionId, step: "animate" }),
      })
    }
    if (!motionId) throw new Error("The motion task is missing")
    const live = characterById(character.id)
    if (!live?.rigTaskId) throw new Error("Character was removed")
    const task = await finishTask(
      {
        kind: "animate",
        rigTaskId: live.rigTaskId,
        motionTaskId: motionId,
        name: prompt,
      },
      resume?.animateTaskId,
      () => {},
      (id) =>
        useStudio.getState().set({
          pendingMotion: pending({
            motionTaskId: motionId,
            animateTaskId: id,
            step: "animate",
          }),
        }),
    )
    const clip = task.clips?.[0]
    if (!clip) throw new Error("Meshy returned no animation file")
    addClip(character.id, { ...clip, id: clipId, name: prompt })
    if (useStudio.getState().activeId === character.id) {
      useStudio
        .getState()
        .set({ animation: clipId, clip: clipId, playing: true })
    }
    useStudio.getState().set({ pendingMotion: undefined })
  } catch (error) {
    useStudio.getState().set({ pendingMotion: undefined })
    toast("Couldn't generate that motion", {
      description: error instanceof Error ? error.message : undefined,
    })
  } finally {
    inFlight.delete(clipId)
    useStudio.getState().set({ loadingAnimation: null })
  }
}

/** Picks up Meshy jobs that were still running when the page last closed. */
async function resumeJobs() {
  const { characters, pendingMotion } = useStudio.getState()
  for (const character of characters) {
    if (character.stage === "ready" || character.stage === "failed") continue
    await generateCharacter(character.prompt, character.id)
  }
  const pending = pendingMotion ?? useStudio.getState().pendingMotion
  if (pending) await generateMotion(pending.prompt, pending)
}

export {
  generateCharacter,
  generateMotion,
  loadConfig,
  playAnimation,
  resumeJobs,
}
