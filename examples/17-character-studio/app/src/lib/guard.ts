import { GATEWAY_KEY_HEADER } from "./gateway"
import { KEY_HEADER } from "./meshy-headers"
import {
  CHAT_OWN_RATE,
  CHAT_SERVER_RATE,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TOOL_ROUNDS,
  MESHY_SERVER_RATE,
  countToolRounds,
} from "./limits"
import { serverChatEnabled, serverMeshyEnabled } from "./paid"
import { clientIp, rateLimit } from "./rate-limit"

type Admission =
  | { ok: true; ownKey?: string }
  | { ok: false; status: number; error: string; retryAfter?: number }

function limited(
  key: string,
  spec: { limit: number; windowMs: number },
  error: string,
): Admission {
  const result = rateLimit(key, spec.limit, spec.windowMs)
  if (result.ok) return { ok: true }
  return { ok: false, status: 429, error, retryAfter: result.retryAfter }
}

function admitChat(
  request: Request,
  messages: { role: string; parts?: { type: string }[] }[],
  env: Record<string, string | undefined> = process.env,
): Admission {
  const ownKey = request.headers.get(GATEWAY_KEY_HEADER)?.trim() || undefined
  if (!ownKey && !serverChatEnabled(env)) {
    return {
      ok: false,
      status: 401,
      error: "Add an AI Gateway key under API keys to use the director.",
    }
  }
  if (messages.length > MAX_CHAT_MESSAGES) {
    return {
      ok: false,
      status: 400,
      error: "This conversation is too long. Start a new one.",
    }
  }
  if (countToolRounds(messages) >= MAX_CHAT_TOOL_ROUNDS) {
    return {
      ok: false,
      status: 429,
      error: "The director hit its step limit for this request.",
    }
  }
  const ip = clientIp(request)
  if (!ownKey) {
    const result = limited(
      `chat-server:${ip}`,
      CHAT_SERVER_RATE,
      "Too many director requests from this network. Try later, or add your own AI Gateway key.",
    )
    if (!result.ok) return result
    return { ok: true }
  }
  const own = limited(
    `chat-own:${ip}`,
    CHAT_OWN_RATE,
    "Too many director requests from this network. Try later.",
  )
  if (!own.ok) return own
  return { ok: true, ownKey }
}

function admitMeshyTask(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Admission {
  const own = request.headers.get(KEY_HEADER)?.trim()
  if (own || !serverMeshyEnabled(env)) return { ok: true }
  return limited(
    `meshy:${clientIp(request)}`,
    MESHY_SERVER_RATE,
    "Too many Meshy jobs from this network. Try later, or add your own Meshy key.",
  )
}

export { admitChat, admitMeshyTask }
