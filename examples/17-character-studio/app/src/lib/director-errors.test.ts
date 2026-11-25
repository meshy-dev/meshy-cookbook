import { expect, test } from "vitest"
import { directorErrorMessage } from "./director-errors"

function gatewayError(status: number, body: object) {
  return Object.assign(new Error("Gateway request failed"), {
    statusCode: status,
    cause: Object.assign(new Error(JSON.stringify(body)), {
      statusCode: status,
      responseBody: JSON.stringify(body),
    }),
  })
}

test("names the missing credit card instead of a generic error", () => {
  const error = gatewayError(403, {
    error: {
      message:
        "AI Gateway requires a valid credit card on file to service requests.",
      type: "customer_verification_required",
    },
  })
  expect(directorErrorMessage(error)).toMatch(/needs a credit card/)
})

test("tells a rejected key and a rate limit apart", () => {
  expect(directorErrorMessage(gatewayError(401, {}))).toMatch(/was rejected/)
  expect(directorErrorMessage(gatewayError(429, {}))).toMatch(
    /Try again in a minute/,
  )
})

test("names an Anthropic account with no credits left", () => {
  const error = gatewayError(400, {
    type: "error",
    error: {
      type: "invalid_request_error",
      message:
        "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
    },
  })
  expect(directorErrorMessage(error)).toMatch(/out of credits/)
})

test("keeps unknown failures generic", () => {
  expect(directorErrorMessage(new Error("socket hang up"))).toBe(
    "The director couldn't reach the AI model. Try again.",
  )
})
