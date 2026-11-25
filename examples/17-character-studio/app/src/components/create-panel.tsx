"use client"

import { Button } from "@ui-sdk/react/button"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress"
import { Textarea } from "@ui-sdk/react/textarea"
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { BoxIcon, CheckIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { generateCharacter } from "@/lib/pipeline"
import { isBuilding } from "@/lib/stage-view"
import {
  activeCharacter,
  defaultClip,
  useStudio,
  type Stage,
} from "@/lib/store"
import { Anchor } from "./anchor"
import { KeysDialog } from "./keys-dialog"

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "mesh", label: "Sculpting mesh", hint: "Meshy text to 3D" },
  { id: "texture", label: "Painting textures", hint: "PBR refine" },
  { id: "rig", label: "Rigging skeleton", hint: "Auto-rig" },
  { id: "idle", label: "Teaching it to idle", hint: "Animation retarget" },
]

const IDEAS = [
  {
    label: "Astronaut",
    prompt: "A weathered astronaut in a patched orange suit, stylized",
  },
  {
    label: "Robot barista",
    prompt: "A cheerful robot barista with a copper body and apron",
  },
  {
    label: "Fox ranger",
    prompt: "A fox ranger in a green hooded cloak, storybook style",
  },
]

function Pipeline() {
  const character = useStudio(activeCharacter)
  if (!character) return null
  if (character.expired) {
    return (
      <p className="notice" data-tone="error" role="alert">
        Meshy files expire after three days. Generate this character again, or
        remove it from the library.
      </p>
    )
  }
  if (character.stage === "ready") return null
  if (character.stage === "failed") {
    return (
      <p className="notice" data-tone="error" role="alert">
        {character.error ?? "Generation failed."}
        {character.modelUrl ? " Showing the last completed stage." : ""}
      </p>
    )
  }
  const current = STAGES.findIndex((stage) => stage.id === character.stage)
  return (
    <ol className="pipeline">
      {STAGES.map((stage, index) => (
        <li
          key={stage.id}
          data-state={
            index < current ? "done" : index === current ? "active" : "todo"
          }
        >
          <span className="pipeline-mark">
            {index < current ? <CheckIcon aria-hidden="true" /> : index + 1}
          </span>
          {index === current ? (
            <Progress value={character.progress} className="pipeline-progress">
              <ProgressLabel>{stage.label}</ProgressLabel>
              <ProgressValue />
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          ) : (
            <span className="pipeline-text">
              {stage.label}
              <small>{stage.hint}</small>
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function Library() {
  const characters = useStudio((state) => state.characters)
  const activeId = useStudio((state) => state.activeId)
  const set = useStudio((state) => state.set)
  const remove = useStudio((state) => state.remove)
  if (characters.length === 0) return null
  return (
    <section className="panel-section">
      <h2 id="characters-title">Characters</h2>
      <Anchor label="Characters">
        <ToggleGroup
          aria-labelledby="characters-title"
          className="library"
          orientation="vertical"
          deselectable={false}
          value={activeId ? [activeId] : []}
          onValueChange={(value) => {
            const next = characters.find((item) => item.id === value[0])
            if (!next) return
            const first = defaultClip(next)
            set({ activeId: next.id, animation: first, clip: first })
          }}
        >
          {characters.map((character) => (
            <div key={character.id} className="library-row">
              <Toggle value={character.id} className="library-item">
                <BoxIcon aria-hidden="true" />
                <span>{character.prompt}</span>
                {character.expired ? (
                  <small>Expired</small>
                ) : isBuilding(character) ? (
                  <small>Building…</small>
                ) : null}
              </Toggle>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={`Delete ${character.prompt}`}
                      className="icon-button"
                      data-agent-confirm="Deletes this character from the library"
                      onClick={() => remove(character.id)}
                    />
                  }
                >
                  <Trash2Icon aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent className="tip">
                  Delete character
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </ToggleGroup>
      </Anchor>
    </section>
  )
}

function CreatePanel() {
  const [prompt, setPrompt] = useState("")
  const meshyAvailable = useStudio((state) => state.meshyAvailable)
  const busy = useStudio((state) => state.characters.some(isBuilding))

  return (
    <aside className="panel" aria-label="Create">
      <section className="panel-section">
        <h2>Create</h2>
        <Anchor label="Character prompt">
          <Field>
            <FieldLabel>Character prompt</FieldLabel>
            <Textarea
              value={prompt}
              onValueChange={(value) => setPrompt(value)}
              placeholder="Describe one character, head to toe"
              rows={4}
            />
          </Field>
        </Anchor>
        <div className="ideas" data-agent-hidden>
          {IDEAS.map((idea) => (
            <button
              key={idea.label}
              type="button"
              onClick={() => setPrompt(idea.prompt)}
            >
              {idea.label}
            </button>
          ))}
        </div>
        <Anchor label="Generate character">
          <Button
            className="primary-button"
            disabled={!meshyAvailable || busy || prompt.trim().length < 3}
            data-agent-confirm="Starts a Meshy job that costs about 38 credits and takes a couple of minutes"
            onClick={() => {
              void generateCharacter(prompt.trim())
              setPrompt("")
            }}
          >
            <SparklesIcon aria-hidden="true" />
            Generate character
          </Button>
        </Anchor>
        <p className="hint">
          {meshyAvailable
            ? "Mesh, textures, rig and idle take about two minutes and 38 Meshy credits."
            : "Add your Meshy API key under API keys to generate characters. Each one takes about two minutes and 38 Meshy credits."}
        </p>
        <Pipeline />
      </section>
      <Library />
      <footer className="panel-footer">
        <KeysDialog />
      </footer>
    </aside>
  )
}

export { CreatePanel }
