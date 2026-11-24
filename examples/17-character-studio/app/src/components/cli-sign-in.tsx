"use client"

import { Button } from "@ui-sdk/react/button"
import { Separator } from "@ui-sdk/react/separator"
import { TerminalIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadConfig } from "@/lib/pipeline"

interface CliView {
  allowed: boolean
  installed?: boolean
  signedIn?: boolean
  account?: string
  credits?: number
}

interface Pending {
  url: string
  code: string
}

async function post<T>(body: object, signal?: AbortSignal) {
  const response = await fetch("/api/meshy/cli/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(data.error ?? "Sign-in failed")
  return data
}

/** Signs in through the Meshy CLI on the computer running the app. The CLI
 * keeps the session; this only starts the browser sign-in and shows its code. */
function CliSignIn({ hasOwnKey }: { hasOwnKey: boolean }) {
  const [view, setView] = useState<CliView | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch("/api/meshy/cli").catch(() => null)
    setView(response?.ok ? ((await response.json()) as CliView) : null)
  }, [])

  useEffect(() => {
    void refresh()
    return () => abort.current?.abort()
  }, [refresh])

  const signIn = async () => {
    setError(null)
    abort.current = new AbortController()
    try {
      const flow = await post<Pending & { flowId: string }>(
        {},
        abort.current.signal,
      )
      setPending({ url: flow.url, code: flow.code })
      await post({ flowId: flow.flowId }, abort.current.signal)
      await refresh()
      await loadConfig()
    } catch (caught) {
      if (!abort.current?.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Sign-in failed")
      }
    } finally {
      setPending(null)
    }
  }

  if (!view?.allowed) return null

  return (
    <>
      <Separator className="keys-separator" />
      <section className="cli" aria-labelledby="cli-title">
        <div className="cli-head">
          <TerminalIcon aria-hidden="true" />
          <h3 id="cli-title">Meshy CLI</h3>
        </div>
        {view.installed === false ? (
          <p className="hint">
            Install the Meshy CLI with <code>npm install -g meshy-cli</code>,
            then reopen this dialog to sign in with your browser instead of
            pasting a key.
          </p>
        ) : view.signedIn ? (
          <p className="cli-account" data-tone="ok">
            Signed in{view.account ? ` as ${view.account}` : ""}
            {view.credits === undefined
              ? ""
              : ` · ${view.credits.toLocaleString("en-US")} credits`}
          </p>
        ) : pending ? (
          <div className="cli-pending" role="status">
            <p>
              Open the Meshy sign-in page, check the code reads{" "}
              <strong>{pending.code}</strong>, and approve.
            </p>
            <div className="keys-actions">
              <Button onClick={() => abort.current?.abort()}>Cancel</Button>
              <a
                className="primary-link"
                href={pending.url}
                target="_blank"
                rel="noreferrer"
              >
                Open sign-in page
              </a>
            </div>
          </div>
        ) : (
          <Button className="cli-button" onClick={() => void signIn()}>
            Sign in with Meshy
          </Button>
        )}
        {error ? (
          <p className="notice" data-tone="error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="hint">
          {hasOwnKey
            ? "Your Meshy key above takes priority over the CLI sign-in."
            : "Used when no Meshy key is set. The CLI keeps its sign-in on this computer and signs each request; the app never sees the token."}
        </p>
      </section>
    </>
  )
}

export { CliSignIn }
