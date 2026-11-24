import { afterEach, expect, test } from "vitest"
import { GATEWAY_KEY_HEADER } from "./gateway"
import { admitChat, admitMeshyTask } from "./guard"
import {
  CHAT_SERVER_RATE,
  MAX_CHAT_TOOL_ROUNDS,
  MESHY_SERVER_RATE,
} from "./limits"
import { KEY_HEADER } from "./meshy-headers"
import { resetRateLimits } from "./rate-limit"

afterEach(() => {
  resetRateLimits()
})

function chatRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9", ...headers },
  })
}

test("rejects server-paid chat when the flag is off", () => {
  const result = admitChat(chatRequest(), [], {
    VERCEL_OIDC_TOKEN: "oidc",
  })
  expect(result).toMatchObject({ ok: false, status: 401 })
})

test("lets a visitor's own gateway key through without the flag", () => {
  const result = admitChat(
    chatRequest({ [GATEWAY_KEY_HEADER]: "vck_own" }),
    [],
    { VERCEL_OIDC_TOKEN: "oidc" },
  )
  expect(result).toEqual({ ok: true, ownKey: "vck_own" })
})

test("caps tool rounds on the conversation", () => {
  const messages = Array.from({ length: MAX_CHAT_TOOL_ROUNDS }, () => ({
    role: "assistant",
    parts: [{ type: "tool-act" }],
  }))
  const result = admitChat(
    chatRequest({ [GATEWAY_KEY_HEADER]: "vck_own" }),
    messages,
  )
  expect(result).toMatchObject({ ok: false, status: 429 })
})

test("rate-limits server-paid chat per IP", () => {
  const env = { ALLOW_SERVER_CHAT: "true", VERCEL_OIDC_TOKEN: "oidc" }
  for (let i = 0; i < CHAT_SERVER_RATE.limit; i += 1) {
    expect(admitChat(chatRequest(), [], env).ok).toBe(true)
  }
  expect(admitChat(chatRequest(), [], env)).toMatchObject({
    ok: false,
    status: 429,
  })
})

test("rate-limits only the Meshy jobs the deployment pays for", () => {
  expect(admitMeshyTask(chatRequest(), {}).ok).toBe(true)
  const env = { ALLOW_SERVER_MESHY: "true", MESHY_API_KEY: "msy_server" }
  for (let i = 0; i < MESHY_SERVER_RATE.limit; i += 1) {
    expect(admitMeshyTask(chatRequest(), env).ok).toBe(true)
  }
  expect(admitMeshyTask(chatRequest(), env)).toMatchObject({
    ok: false,
    status: 429,
  })
  expect(admitMeshyTask(chatRequest({ [KEY_HEADER]: "msy_own" }), env).ok).toBe(
    true,
  )
})
