import { z } from "zod"
import { CliError, finishCliLogin, startCliLogin } from "@/lib/meshy-cli"
import { cliAllowed } from "@/lib/paid"

const input = z.object({
  flowId: z
    .string()
    .regex(/^[\w-]{1,200}$/)
    .optional(),
})

/** Starts the CLI's browser sign-in, or, given its flow id, waits for the
 * person to approve it. The CLI stores the session; nothing comes back here. */
async function POST(request: Request) {
  if (!cliAllowed()) {
    return Response.json(
      { error: "This app can't use a Meshy CLI sign-in here" },
      { status: 403 },
    )
  }
  const parsed = input.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  try {
    if (!parsed.data.flowId) return Response.json(await startCliLogin())
    await finishCliLogin(parsed.data.flowId, request.signal)
    return Response.json({ signedIn: true })
  } catch (error) {
    const message = error instanceof CliError ? error.message : "Sign-in failed"
    return Response.json({ error: message }, { status: 502 })
  }
}

export { POST }
