import { expect, test } from "vitest"
import { chooseDirector } from "./director"

test("a person's own key wins", () => {
  const env = {
    AI_GATEWAY_API_KEY: "vck_server",
    ANTHROPIC_API_KEY: "sk-server",
  }
  expect(chooseDirector({ kind: "anthropic", key: "sk-own" }, env)).toEqual({
    provider: "anthropic",
    source: "own",
    modelId: "claude-sonnet-5-5",
    key: "sk-own",
  })
  expect(
    chooseDirector({ kind: "gateway", key: "vck_own" }, env),
  ).toMatchObject({
    provider: "gateway",
    source: "own",
    modelId: "anthropic/claude-sonnet-5.5",
  })
})

test("without a key of its own, the server's Anthropic key comes before its AI Gateway", () => {
  expect(
    chooseDirector(undefined, {
      VERCEL_OIDC_TOKEN: "oidc",
      ANTHROPIC_API_KEY: "sk",
    }),
  ).toMatchObject({ provider: "anthropic", source: "server" })
  expect(
    chooseDirector(undefined, { VERCEL_OIDC_TOKEN: "oidc" }),
  ).toMatchObject({ provider: "gateway", source: "server" })
  expect(chooseDirector(undefined, { ANTHROPIC_API_KEY: "sk-server" })).toEqual(
    {
      provider: "anthropic",
      source: "server",
      modelId: "claude-sonnet-5-5",
      key: "sk-server",
    },
  )
})

test("each provider has its own model setting", () => {
  const env = {
    AGENT_MODEL: "anthropic/claude-opus-5.5",
    AGENT_ANTHROPIC_MODEL: "claude-opus-5-5",
  }
  expect(chooseDirector({ kind: "gateway", key: "v" }, env).modelId).toBe(
    "anthropic/claude-opus-5.5",
  )
  expect(chooseDirector({ kind: "anthropic", key: "s" }, env).modelId).toBe(
    "claude-opus-5-5",
  )
})
