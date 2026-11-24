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
import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"
import { keyHeaders, useKeys } from "@/lib/keys"
import { loadConfig } from "@/lib/pipeline"
import { useStudio } from "@/lib/store"
import { CliSignIn } from "./cli-sign-in"

interface KeyStatus {
  ok: boolean
  credits?: number
  error?: string
}

type Check = { meshy: KeyStatus | null; gateway: KeyStatus | null }

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
  const [check, setCheck] = useState<Check | null>(null)

  const save = async () => {
    const keys = { meshy: meshy.trim(), gateway: gateway.trim() }
    const response = await fetch("/api/keys/check", {
      headers: keyHeaders(keys),
    })
    const result = (await response.json()) as Check
    setCheck(result)
    const rejected = result.meshy?.ok === false || result.gateway?.ok === false
    if (rejected) return
    saved.set(keys)
    await loadConfig()
    if (!keys.meshy && !keys.gateway) onSaved()
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
          empty="Runs the chat director. Every control on the page works without it."
        />
        <a
          href="https://vercel.com/ai-gateway"
          target="_blank"
          rel="noreferrer"
        >
          Get an AI Gateway key
        </a>
      </Field>
      <div className="keys-actions">
        <Button
          onClick={() => {
            setMeshy("")
            setGateway("")
            setCheck(null)
          }}
          disabled={!meshy && !gateway}
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

function KeysDialog() {
  const [open, setOpen] = useState(false)
  const own = useKeys((state) => Boolean(state.meshy || state.gateway))

  // Hidden from agents on both sides: an agent has no business reading,
  // filling or opening the place where keys are kept.
  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger className="keys-trigger" data-agent-hidden>
        <KeyRoundIcon aria-hidden="true" />
        API keys
        {own ? <span className="keys-dot" aria-label="saved" /> : null}
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="keys-dialog" data-agent-hidden>
        <DialogTitle>Your API keys</DialogTitle>
        <DialogDescription>
          Keys are saved in this browser only. They are sent to this app's
          server with each request so it can call Meshy and AI Gateway for you,
          and are never stored there.
        </DialogDescription>
        {open ? <KeysForm onSaved={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

export { KeysDialog }
