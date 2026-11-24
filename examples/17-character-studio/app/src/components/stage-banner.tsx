"use client"

import { Button } from "@ui-sdk/react/button"
import { generateCharacter } from "@/lib/pipeline"
import { stageView } from "@/lib/stage-view"
import { activeCharacter, useStudio } from "@/lib/store"

function StageBanner() {
  const character = useStudio(activeCharacter)
  const remove = useStudio((state) => state.remove)
  const view = stageView(character)

  if (view === "empty") {
    return (
      <div className="stage-empty">
        <p>Describe a character to put it on stage.</p>
      </div>
    )
  }

  if (view === "expired" && character) {
    return (
      <div className="stage-banner" data-agent-hidden>
        <p className="notice" data-tone="error" role="alert">
          This character's files expired. Meshy deletes models after three days.
        </p>
        <div className="stage-banner-actions">
          <Button
            className="primary-button"
            onClick={() => {
              const prompt = character.prompt
              remove(character.id)
              void generateCharacter(prompt)
            }}
          >
            Regenerate
          </Button>
          <Button onClick={() => remove(character.id)}>
            Remove from library
          </Button>
        </div>
      </div>
    )
  }

  if (view === "failed-model" && character) {
    return (
      <div className="stage-banner">
        <p className="notice" data-tone="error" role="alert">
          {character.error ?? "Generation failed."} Showing the last completed
          stage.
        </p>
      </div>
    )
  }

  return null
}

export { StageBanner }
