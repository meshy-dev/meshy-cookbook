import { expect, test } from "vitest"
import { MAX_CHAT_TOOL_ROUNDS, countToolRounds } from "./limits"

test("counts assistant tool rounds and ignores user text", () => {
  expect(
    countToolRounds([
      { role: "user", parts: [{ type: "text" }] },
      { role: "assistant", parts: [{ type: "tool-snapshot" }] },
      { role: "assistant", parts: [{ type: "tool-act" }, { type: "text" }] },
      { role: "assistant", parts: [{ type: "text" }] },
    ]),
  ).toBe(2)
  expect(MAX_CHAT_TOOL_ROUNDS).toBeGreaterThan(0)
})
