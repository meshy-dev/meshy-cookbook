import { afterEach, expect, test } from "vitest"
import {
  resolveMeshyAuth,
  resolveMeshyKey,
  serverChatEnabled,
  serverMeshyEnabled,
} from "./paid"

afterEach(() => {
  delete process.env.ALLOW_SERVER_CHAT
  delete process.env.ALLOW_SERVER_MESHY
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  delete process.env.MESHY_API_KEY
})

test("server chat stays off when OIDC is present without the flag", () => {
  expect(
    serverChatEnabled({ VERCEL_OIDC_TOKEN: "oidc", ALLOW_SERVER_CHAT: "" }),
  ).toBe(false)
})

test("server chat turns on only with the flag and a gateway credential", () => {
  expect(
    serverChatEnabled({
      VERCEL_OIDC_TOKEN: "oidc",
      ALLOW_SERVER_CHAT: "true",
    }),
  ).toBe(true)
  expect(serverChatEnabled({ ALLOW_SERVER_CHAT: "true" })).toBe(false)
})

test("server Meshy stays off when a key is set without the flag", () => {
  expect(
    serverMeshyEnabled({ MESHY_API_KEY: "msy_secret", ALLOW_SERVER_MESHY: "" }),
  ).toBe(false)
})

test("a visitor's Meshy key wins; the server key is unused without the flag", () => {
  const env = { MESHY_API_KEY: "msy_server" }
  expect(resolveMeshyKey("msy_own", env)).toBe("msy_own")
  expect(resolveMeshyKey(undefined, env)).toBeUndefined()
  expect(
    resolveMeshyKey(undefined, { ...env, ALLOW_SERVER_MESHY: "true" }),
  ).toBe("msy_server")
})

test("the Meshy CLI's sign-in comes last, and only under next dev or the flag", () => {
  const dev = { NODE_ENV: "development" }
  const prod = { NODE_ENV: "production" }
  expect(resolveMeshyAuth("msy_own", dev)).toEqual({
    kind: "key",
    key: "msy_own",
  })
  expect(resolveMeshyAuth(undefined, dev)).toEqual({ kind: "cli" })
  expect(resolveMeshyAuth(undefined, prod)).toBeUndefined()
  expect(
    resolveMeshyAuth(undefined, { ...prod, ALLOW_SERVER_MESHY: "true" }),
  ).toEqual({ kind: "cli" })
  expect(
    resolveMeshyAuth(undefined, {
      ...prod,
      ALLOW_SERVER_MESHY: "true",
      MESHY_API_KEY: "msy_server",
    }),
  ).toEqual({ kind: "key", key: "msy_server" })
})
