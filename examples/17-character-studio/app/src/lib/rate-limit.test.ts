import { afterEach, expect, test } from "vitest"
import { clientIp, rateLimit, resetRateLimits } from "./rate-limit"

afterEach(resetRateLimits)

test("allows up to the limit then refuses until the window passes", () => {
  const windowMs = 10_000
  expect(rateLimit("ip", 2, windowMs, 0)).toEqual({ ok: true })
  expect(rateLimit("ip", 2, windowMs, 1)).toEqual({ ok: true })
  expect(rateLimit("ip", 2, windowMs, 2)).toEqual({
    ok: false,
    retryAfter: 10,
  })
  expect(rateLimit("ip", 2, windowMs, 10_000)).toEqual({ ok: true })
})

test("reads the first forwarded IP", () => {
  const request = new Request("http://localhost/api/chat", {
    headers: { "x-forwarded-for": " 203.0.113.9, 10.0.0.1" },
  })
  expect(clientIp(request)).toBe("203.0.113.9")
})
