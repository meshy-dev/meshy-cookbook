"use client"

import { Button } from "@ui-sdk/react/button"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"
import { keyHeaders, useKeys, type SavedKeys } from "@/lib/keys"
import { loadConfig } from "@/lib/pipeline"
import { useStudio } from "@/lib/store"
import { CliSignIn } from "./cli-sign-in"

interface KeyStatus {
  ok: boolean
  credits?: number
  error?: string
}

type Check = Record<keyof SavedKeys, KeyStatus | null>

function Status({
  status,
  provided,
  empty,
}: {
  status: KeyStatus | null | undefined
  provided: boolean
  empty: string
}) {
  if (status?.ok) {
    return (
      <FieldDescription data-tone="ok">
        Works
        {status.credits === undefined
          ? ""
          : ` · ${status.credits.toLocaleString("en-US")} credits`}
      </FieldDescription>
    )
  }
  if (status) {
    return <FieldDescription data-tone="error">{status.error}</FieldDescription>
  }
  return (
    <FieldDescription>
      {provided ? "This site already provides one. Yours replaces it." : empty}
    </FieldDescription>
  )
}

function KeysForm({ onSaved }: { onSaved: () => void }) {
  const saved = useKeys()
  const server = useStudio((state) => state.server)
  const [meshy, setMeshy] = useState(saved.meshy)
  const [gateway, setGateway] = useState(saved.gateway)
  const [anthropic, setAnthropic] = useState(saved.anthropic)
  const [check, setCheck] = useState<Check | null>(null)

  const save = async () => {
    const keys = {
      meshy: meshy.trim(),
      gateway: gateway.trim(),
      anthropic: anthropic.trim(),
    }
    const response = await fetch("/api/keys/check", {
      headers: keyHeaders(keys),
    })
    const result = (await response.json()) as Check
    setCheck(result)
    const rejected = Object.values(result).some(
      (status) => status?.ok === false,
    )
    if (rejected) return
    saved.set(keys)
    await loadConfig()
    if (!keys.meshy && !keys.gateway && !keys.anthropic) onSaved()
  }

  return (
    <form
      className="keys-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <Field>
        <FieldLabel>Meshy API key</FieldLabel>
        <PasswordInput
          value={meshy}
          onValueChange={(value) => setMeshy(value)}
          autoComplete="off"
        >
          <PasswordInputControl placeholder="msy_…" spellCheck={false} />
          <PasswordInputToggle aria-label="Show Meshy key" />
        </PasswordInput>
        <Status
          status={check?.meshy}
          provided={server.meshySource === "key"}
          empty="Generates, rigs and animates characters. Needs a paid Meshy plan."
        />
        <a
          href="https://www.meshy.ai/developers/keys"
          target="_blank"
          rel="noreferrer"
        >
          Get a Meshy key
        </a>
      </Field>
      <CliSignIn hasOwnKey={Boolean(saved.meshy)} />
      <Field>
        <FieldLabel>Vercel AI Gateway key</FieldLabel>
        <PasswordInput
          value={gateway}
          onValueChange={(value) => setGateway(value)}
          autoComplete="off"
        >
          <PasswordInputControl placeholder="vck_…" spellCheck={false} />
          <PasswordInputToggle aria-label="Show AI Gateway key" />
        </PasswordInput>
        <Status
          status={check?.gateway}
          provided={server.agent}
          empty="Runs the chat director through Vercel. Every control on the page works without it."
        />
        <a
          href="https://vercel.com/ai-gateway"
          target="_blank"
          rel="noreferrer"
        >
          Get an AI Gateway key
        </a>
      </Field>
      <Field>
        <FieldLabel>Anthropic API key</FieldLabel>
        <PasswordInput
          value={anthropic}
          onValueChange={(value) => setAnthropic(value)}
          autoComplete="off"
        >
          <PasswordInputControl placeholder="sk-ant-…" spellCheck={false} />
          <PasswordInputToggle aria-label="Show Anthropic key" />
        </PasswordInput>
        <Status
          status={check?.anthropic}
          provided={server.agent}
          empty="Or runs the director on Claude directly, with no Vercel account. With both keys, this one is used."
        />
        <a
          href="https://platform.claude.com/settings/keys"
          target="_blank"
          rel="noreferrer"
        >
          Get an Anthropic API key
        </a>
      </Field>
      <div className="keys-actions">
        <Button
          onClick={() => {
            setMeshy("")
            setGateway("")
            setAnthropic("")
            setCheck(null)
          }}
          disabled={!meshy && !gateway && !anthropic}
        >
          Clear
        </Button>
        <DialogClose>Close</DialogClose>
        <Button type="submit" className="primary-button">
          Check and save
        </Button>
      </div>
    </form>
  )
}

function meshyStatus(
  live: boolean,
  own: boolean,
  server: { meshySource: "key" | "cli" | null; cli: boolean },
) {
  if (own) return "Meshy connected with the key you added"
  if (server.meshySource === "cli") {
    return "Meshy connected with your Meshy CLI sign-in"
  }
  if (live) return "Meshy connected with this app's server key"
  return server.cli
    ? "No Meshy key yet: add one, or sign in with the Meshy CLI"
    : "No Meshy key yet: add one to generate characters"
}

function KeysDialog() {
  const [open, setOpen] = useState(false)
  const live = useStudio((state) => state.meshyAvailable)
  const server = useStudio((state) => state.server)
  const own = useKeys((state) => Boolean(state.meshy))

  // Hidden from agents on both sides: an agent has no business reading,
  // filling or opening the place where keys are kept.
  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              className="keys-trigger"
              data-live={live ? "" : undefined}
              data-agent-hidden
            />
          }
        >
          <KeyRoundIcon aria-hidden="true" />
          API keys
          <span className="keys-dot" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent className="tip">
          {meshyStatus(live, own, server)}
        </TooltipContent>
      </Tooltip>
      <DialogBackdrop />
      <DialogContent className="keys-dialog" data-agent-hidden>
        <DialogTitle>Your API keys</DialogTitle>
        <DialogDescription>
          Keys are saved in this browser only. They are sent to this app's
          server with each request so it can call Meshy and the director's AI
          model for you, and are never stored there.
        </DialogDescription>
        {open ? <KeysForm onSaved={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

export { KeysDialog }
