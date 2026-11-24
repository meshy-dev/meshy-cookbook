"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { useKeys } from "@/lib/keys"
import { useStudio } from "@/lib/store"

function MeshyStatus() {
  const live = useStudio((state) => state.meshyAvailable)
  const server = useStudio((state) => state.server)
  const own = useKeys((state) => Boolean(state.meshy))
  const hint = own
    ? "Using the Meshy key you added under API keys"
    : server.meshySource === "cli"
      ? "Using your Meshy CLI sign-in on this computer"
      : server.meshySource === "key"
        ? "Using the Meshy key in this app's server settings"
        : server.cli
          ? "Add a Meshy key or sign in with the Meshy CLI under API keys"
          : "Add a Meshy key under API keys to generate characters"

  return (
    <Tooltip toggleable>
      <TooltipTrigger
        className="status"
        data-live={live ? "" : undefined}
        data-agent-hidden
      >
        <span className="status-dot" aria-hidden="true" />
        {live ? "Meshy connected" : "No Meshy key"}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="tip">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

export { MeshyStatus }
