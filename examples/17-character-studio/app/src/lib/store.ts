"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Clip, LibraryAnimation, TaskKind } from "./types"

type Stage = "mesh" | "texture" | "rig" | "idle" | "ready" | "failed"

interface Character {
  id: string
  prompt: string
  stage: Stage
  progress: number
  error?: string
  expired?: boolean
  modelUrl?: string
  // Untextured preview, kept so the textured mesh can dissolve in over it.
  previewUrl?: string
  textured: boolean
  previewTaskId?: string
  refineTaskId?: string
  rigTaskId?: string
  idleTaskId?: string
  /** The Meshy task currently being polled, so a reload can pick it up. */
  task?: { kind: TaskKind; id: string }
  clips: Clip[]
}

interface PendingMotion {
  characterId: string
  prompt: string
  clipId: string
  step: "motion" | "animate"
  motionTaskId?: string
  animateTaskId?: string
}

type Finish = "original" | "matte" | "metal" | "wire"
type Camera = "front" | "hero" | "side" | "back" | "face"
type Backdrop = "studio" | "sunset" | "night" | "void"

interface Studio {
  /** What the deployment itself provides: Meshy access, from its key or the
   * Meshy CLI's sign-in, whether it may use that sign-in, and the director. */
  server: {
    meshy: boolean
    meshySource: "key" | "cli" | null
    cli: boolean
    agent: boolean
  }
  /** A Meshy key is available: the person's own or the deployment's. */
  meshyAvailable: boolean
  agentAvailable: boolean
  library: LibraryAnimation[]
  characters: Character[]
  activeId: string | null
  pendingMotion?: PendingMotion

  /** The animation chosen in the picker. */
  animation: string | null
  /** The clip on stage. It trails `animation` while a new clip loads. */
  clip: string | null
  /** A clip being fetched or retargeted, by library id. */
  loadingAnimation: string | null
  playing: boolean
  speed: number
  camera: Camera
  autoRotate: boolean
  finish: Finish
  tint: string
  backdrop: Backdrop
  skeleton: boolean

  set: (patch: Partial<Studio>) => void
  upsert: (id: string, patch: Partial<Character>) => void
  remove: (id: string) => void
}

const DEFAULT_TINT = "#ffffff"

function persistStudio(state: Studio) {
  return {
    characters: state.characters,
    activeId: state.activeId,
    pendingMotion: state.pendingMotion,
  }
}

const useStudio = create<Studio>()(
  persist(
    (set) => ({
      server: { meshy: false, meshySource: null, cli: false, agent: false },
      meshyAvailable: false,
      agentAvailable: false,
      library: [],
      characters: [],
      activeId: null,
      animation: null,
      clip: null,
      loadingAnimation: null,
      playing: true,
      speed: 1,
      camera: "hero",
      autoRotate: false,
      finish: "original",
      tint: DEFAULT_TINT,
      backdrop: "studio",
      skeleton: false,
      set: (patch) => set(patch),
      upsert: (id, patch) =>
        set((state) => ({
          characters: state.characters.some((item) => item.id === id)
            ? state.characters.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
              )
            : [...state.characters, { ...(patch as Character), id }],
        })),
      remove: (id) =>
        set((state) => ({
          characters: state.characters.filter((item) => item.id !== id),
          activeId: state.activeId === id ? null : state.activeId,
          pendingMotion:
            state.pendingMotion?.characterId === id
              ? undefined
              : state.pendingMotion,
        })),
    }),
    {
      name: "character-studio",
      version: 2,
      partialize: persistStudio,
    },
  ),
)

function activeCharacter(state: Studio) {
  return state.characters.find((item) => item.id === state.activeId) ?? null
}

/** The clip a character opens on: its idle when it has one. */
function defaultClip(character: Character) {
  const idle = character.clips.find((clip) => /^idle$/i.test(clip.name))
  return (idle ?? character.clips[0])?.id ?? null
}

export { DEFAULT_TINT, activeCharacter, defaultClip, persistStudio, useStudio }
export type {
  Backdrop,
  Camera,
  Character,
  Finish,
  PendingMotion,
  Stage,
  Studio,
}
