import "server-only"
import { execFile } from "node:child_process"

// The Meshy CLI keeps its sign-in encrypted under a key the OS holds, and only
// the CLI may read it. So the app never sees the token: it runs the CLI, which
// signs each request and refreshes the session itself.

interface Envelope<T> {
  ok: boolean
  result: T | null
  error: {
    code?: string
    message?: string
    http_status?: number
    details?: { body?: { message?: string }; oauth_error?: string }
  } | null
}

class CliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

function childEnv() {
  // An exported MESHY_API_KEY would win over the stored sign-in.
  const env = { ...process.env }
  delete env.MESHY_API_KEY
  return env
}

function run<T>(
  args: string[],
  { timeoutMs = 60_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    execFile(
      "meshy",
      [...args, "--format", "json", "--no-update-check"],
      {
        env: childEnv(),
        timeout: timeoutMs,
        signal,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout) => {
        const code = (error as NodeJS.ErrnoException | null)?.code
        if (code === "ENOENT") {
          reject(new CliError("The Meshy CLI isn't installed", "not_installed"))
          return
        }
        try {
          resolve(JSON.parse(stdout) as Envelope<T>)
        } catch {
          reject(
            new CliError(
              signal?.aborted ? "Canceled" : "The Meshy CLI didn't answer",
              signal?.aborted ? "aborted" : "no_output",
            ),
          )
        }
      },
    )
  })
}

/** One API request, signed by the CLI's stored sign-in. `path` starts with
 * its API version, like `/v2/text-to-3d` or `/v1/rigging/<id>`. */
async function cliRequest(method: "GET" | "POST", path: string, body?: unknown) {
  const [, version, ...rest] = path.split("/")
  const args = ["api", method, `/${rest.join("/")}`, `--${version}`]
  if (body !== undefined) args.push("--data", JSON.stringify(body))
  const envelope = await run<{ http_status: number; body: unknown }>(args)
  if (envelope.ok && envelope.result) return envelope.result.body
  const error = envelope.error ?? {}
  throw new CliError(
    error.details?.body?.message ?? error.message ?? "The Meshy CLI request failed",
    error.code ?? "api",
    error.http_status,
  )
}

interface CliStatus {
  installed: boolean
  signedIn: boolean
  account?: string
  credits?: number
}

interface RawStatus {
  authenticated?: boolean
  verified?: boolean
  source?: string
  account?: { name?: string; email?: string } | null
  balance?: { balance?: number } | null
}

async function cliStatus({ offline = false } = {}): Promise<CliStatus> {
  try {
    const envelope = await run<RawStatus>(
      ["auth", "status", ...(offline ? ["--offline"] : [])],
      { timeoutMs: 20_000 },
    )
    const result = envelope.result ?? {}
    const signedIn = Boolean(
      result.authenticated && (offline || result.verified),
    )
    return {
      installed: true,
      signedIn,
      account: signedIn
        ? (result.account?.name ?? result.account?.email ?? undefined)
        : undefined,
      credits: signedIn ? result.balance?.balance : undefined,
    }
  } catch (error) {
    if (error instanceof CliError && error.code === "not_installed") {
      return { installed: false, signedIn: false }
    }
    return { installed: true, signedIn: false }
  }
}

let cached: { at: number; status: CliStatus } | undefined

/** Whether the CLI has a session, checked without the network and cached
 * briefly, since the page asks on every load. */
async function cliSignedIn() {
  if (cached && Date.now() - cached.at < 30_000) return cached.status.signedIn
  const status = await cliStatus({ offline: true })
  cached = { at: Date.now(), status }
  return status.signedIn
}

function forgetCliStatus() {
  cached = undefined
}

interface DeviceLogin {
  flowId: string
  url: string
  code: string
}

async function startCliLogin(): Promise<DeviceLogin> {
  const envelope = await run<{
    flow_id: string
    verification_url: string
    user_code: string
  }>(["auth", "login", "--device", "--no-wait"], { timeoutMs: 30_000 })
  if (!envelope.ok || !envelope.result) {
    throw new CliError(
      envelope.error?.message ?? "Couldn't start the Meshy sign-in",
      envelope.error?.code ?? "login",
    )
  }
  const { flow_id, verification_url, user_code } = envelope.result
  return { flowId: flow_id, url: verification_url, code: user_code }
}

/** Waits until the person approves the sign-in in their browser, or the code
 * expires. */
async function finishCliLogin(flowId: string, signal?: AbortSignal) {
  const envelope = await run<{ status?: string }>(
    ["auth", "login", "--device-flow", flowId],
    { timeoutMs: 20 * 60_000, signal },
  )
  forgetCliStatus()
  if (!envelope.ok) {
    throw new CliError(
      envelope.error?.details?.oauth_error === "access_denied"
        ? "The sign-in was denied"
        : envelope.error?.details?.oauth_error === "expired_token"
          ? "The sign-in code expired. Start again."
          : (envelope.error?.message ?? "The sign-in didn't finish"),
      envelope.error?.code ?? "login",
    )
  }
}

export {
  CliError,
  cliRequest,
  cliSignedIn,
  cliStatus,
  finishCliLogin,
  forgetCliStatus,
  startCliLogin,
}
export type { CliStatus, DeviceLogin }
