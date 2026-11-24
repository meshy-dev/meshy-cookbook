import type { Character } from "./store"

function stageModelUrl(character: Character | null) {
  if (!character?.modelUrl || character.expired) return undefined
  return character.modelUrl
}

function stageView(
  character: Character | null,
): "empty" | "build" | "model" | "expired" | "failed" | "failed-model" {
  if (!character) return "empty"
  if (character.expired) return "expired"
  if (character.stage === "failed") {
    return character.modelUrl ? "failed-model" : "failed"
  }
  return character.modelUrl ? "model" : "build"
}

function isBuilding(character: Character) {
  return character.stage !== "ready" && character.stage !== "failed"
}

export { isBuilding, stageModelUrl, stageView }
