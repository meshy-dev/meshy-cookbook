import Anthropic from "@anthropic-ai/sdk"
import { ANTHROPIC_KEY_HEADER } from "@/lib/anthropic-headers"
import { GATEWAY_KEY_HEADER } from "@/lib/gateway"
import { KEY_HEADER, MeshyError, getBalance } from "@/lib/meshy"

interface KeyStatus {
  ok: boolean
  credits?: number
  error?: string
}

async function checkMeshy(key: string): Promise<KeyStatus> {
  try {
    return { ok: true, credits: await getBalance(key) }
  } catch (error) {
    const rejected = error instanceof MeshyError && error.status === 401
    return {
      ok: false,
      error: rejected ? "Meshy rejected this key" : "Couldn't reach Meshy",
    }
  }
}

async function checkGateway(key: string): Promise<KeyStatus> {
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    })
    if (response.ok) return { ok: true }
    return {
      ok: false,
      error:
        response.status === 401
          ? "AI Gateway rejected this key"
          : `AI Gateway returned ${response.status}`,
    }
  } catch {
    return { ok: false, error: "Couldn't reach AI Gateway" }
  }
}

/** Lists one model, which costs nothing, to see whether Anthropic takes the key. */
async function checkAnthropic(key: string): Promise<KeyStatus> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0 }).models.list({
      limit: 1,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic rejected this key" }
    }
    if (error instanceof Anthropic.APIError && error.status) {
      return { ok: false, error: `Anthropic returned ${error.status}` }
    }
    return { ok: false, error: "Couldn't reach Anthropic" }
  }
}

/** Checks the keys a person typed, before the page saves them. */
async function GET(request: Request) {
  const meshy = request.headers.get(KEY_HEADER)?.trim()
  const gateway = request.headers.get(GATEWAY_KEY_HEADER)?.trim()
  const anthropic = request.headers.get(ANTHROPIC_KEY_HEADER)?.trim()
  const [meshyStatus, gatewayStatus, anthropicStatus] = await Promise.all([
    meshy ? checkMeshy(meshy) : null,
    gateway ? checkGateway(gateway) : null,
    anthropic ? checkAnthropic(anthropic) : null,
  ])
  return Response.json({
    meshy: meshyStatus,
    gateway: gatewayStatus,
    anthropic: anthropicStatus,
  })
}

export { GET }
