"use client"

import { useEffect, useRef, useState } from "react"
import type { Character, Stage } from "./store"

const REVEAL = {
  scanMs: 1600,
  dissolveMs: 2400,
  bonesMs: 1600,
  height: 1.7,
} as const

type RevealPhase =
  "build" | "scan" | "gray" | "dissolve" | "textured" | "bones" | "ready"

type RevealStep = {
  phase: RevealPhase
  after: RevealPhase
  ms: number
}

function settledPhase(character: Character): RevealPhase {
  switch (character.stage) {
    case "mesh":
      return "build"
    case "texture":
      return "gray"
    case "rig":
      return "textured"
    case "idle":
      return "textured"
    case "ready":
      return "ready"
    case "failed":
      return character.modelUrl
        ? character.textured
          ? "textured"
          : "gray"
        : "build"
    default: {
      const exhaustive: never = character.stage
      return exhaustive
    }
  }
}

function enterTransition(
  from: Stage | undefined,
  to: Stage,
): RevealStep | null {
  if (from === undefined || from === to) return null
  switch (to) {
    case "mesh":
      return { phase: "build", after: "build", ms: 0 }
    case "texture":
      return { phase: "scan", after: "gray", ms: REVEAL.scanMs }
    case "rig":
      return { phase: "dissolve", after: "textured", ms: REVEAL.dissolveMs }
    case "idle":
      return { phase: "bones", after: "textured", ms: REVEAL.bonesMs }
    case "ready":
      // idle already started the skeleton beat; don't play it twice.
      // If React skipped idle (same tick as ready), treat it as a bones beat.
      if (from === "rig") {
        return { phase: "bones", after: "ready", ms: REVEAL.bonesMs }
      }
      return null
    case "failed":
      return null
    default: {
      const exhaustive: never = to
      return exhaustive
    }
  }
}

function layers(
  phase: RevealPhase,
  character: Character,
): {
  grayUrl?: string
  colorUrl?: string
  scan: boolean
  wipe: boolean
  bones: boolean
  playClip: boolean
} {
  const preview =
    character.previewUrl ??
    (character.textured ? undefined : character.modelUrl)
  const current = character.modelUrl
  switch (phase) {
    case "build":
      return { scan: false, wipe: false, bones: false, playClip: false }
    case "scan":
      return {
        grayUrl: preview ?? current,
        scan: true,
        wipe: false,
        bones: false,
        playClip: false,
      }
    case "gray":
      return {
        grayUrl: preview ?? current,
        scan: false,
        wipe: false,
        bones: false,
        playClip: false,
      }
    case "dissolve":
      return {
        grayUrl: preview,
        colorUrl: current,
        scan: false,
        wipe: true,
        bones: false,
        playClip: false,
      }
    case "textured":
      return {
        colorUrl: current,
        scan: false,
        wipe: false,
        bones: false,
        playClip: false,
      }
    case "bones":
      return {
        colorUrl: current,
        scan: false,
        wipe: false,
        bones: true,
        playClip: false,
      }
    case "ready":
      return {
        colorUrl: current,
        scan: false,
        wipe: false,
        bones: false,
        playClip: true,
      }
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

function nextPhase(phase: RevealPhase, stage?: Stage): RevealPhase {
  switch (phase) {
    case "scan":
      return "gray"
    case "dissolve":
      return "textured"
    case "bones":
      return stage === "ready" ? "ready" : "textured"
    case "build":
    case "gray":
    case "textured":
    case "ready":
      return phase
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

function useReveal(character: Character | null) {
  const [phase, setPhase] = useState<RevealPhase>(() =>
    character ? settledPhase(character) : "build",
  )
  const prevId = useRef(character?.id)
  const prevStage = useRef<Stage | undefined>(character?.stage)
  const stageRef = useRef(character?.stage)
  const characterRef = useRef(character)
  characterRef.current = character
  stageRef.current = character?.stage

  const advance = (from?: RevealPhase) => {
    setPhase((current) => {
      if (from && current !== from) return current
      return nextPhase(from ?? current, stageRef.current)
    })
  }

  useEffect(() => {
    const current = characterRef.current
    if (!current) {
      prevId.current = undefined
      prevStage.current = undefined
      setPhase("build")
      return
    }
    if (prevId.current !== current.id) {
      prevId.current = current.id
      prevStage.current = current.stage
      setPhase(settledPhase(current))
      return
    }
    const from = prevStage.current
    prevStage.current = current.stage
    const step = enterTransition(from, current.stage)
    if (!step) {
      if (current.stage === "ready") {
        setPhase((now) => (now === "bones" ? now : "ready"))
      }
      return
    }
    setPhase(step.phase)
    if (step.ms <= 0) {
      setPhase(step.after)
      return
    }
    if (step.phase !== "bones") return
    const timer = window.setTimeout(() => advance("bones"), step.ms)
    return () => window.clearTimeout(timer)
  }, [character?.id, character?.stage])

  return {
    phase,
    advance,
    layers: character ? layers(phase, character) : null,
  }
}

export { REVEAL, enterTransition, layers, nextPhase, settledPhase, useReveal }
export type { RevealPhase }
