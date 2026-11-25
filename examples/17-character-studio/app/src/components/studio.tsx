"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from "@ui-sdk/react/toast"
import dynamic from "next/dynamic"
import { useEffect } from "react"
import { loadConfig, resumeJobs } from "@/lib/pipeline"
import { activeCharacter, defaultClip, useStudio } from "@/lib/store"
import { AgentDock } from "./agent-dock"
import { AgentPointer } from "./agent-pointer"
import { CreatePanel } from "./create-panel"
import { DirectorPanel } from "./director-panel"
import { StageBanner } from "./stage-banner"

const Stage = dynamic(() => import("./stage").then((module) => module.Stage), {
  ssr: false,
})

function Studio() {
  const backdrop = useStudio((state) => state.backdrop)
  const character = useStudio(activeCharacter)

  const clip = useStudio((state) => state.clip)

  useEffect(() => {
    void loadConfig().then(() => resumeJobs())
  }, [])

  useEffect(() => {
    if (character?.stage !== "ready" || character.expired || clip) return
    const first = defaultClip(character)
    if (first) useStudio.getState().set({ animation: first, clip: first })
  }, [character, clip])

  return (
    <main className="studio" data-backdrop={backdrop}>
      <CreatePanel />
      <section className="stage" aria-label="Stage">
        <header className="stage-header">
          <h1>Character Studio</h1>
        </header>
        <div className="stage-canvas">
          <Stage />
        </div>
        <StageBanner />
        <AgentDock />
      </section>
      <DirectorPanel />
      <AgentPointer />
      <ToastRegion>
        {() => (
          <Toast>
            <ToastTitle />
            <ToastDescription />
            <ToastClose aria-label="Dismiss" />
          </Toast>
        )}
      </ToastRegion>
    </main>
  )
}

export { Studio }
