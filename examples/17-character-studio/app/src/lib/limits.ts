const MAX_CHAT_TOOL_ROUNDS = 8
const MAX_CHAT_MESSAGES = 24

const CHAT_SERVER_RATE = { limit: 10, windowMs: 10 * 60 * 1000 }
const CHAT_OWN_RATE = { limit: 40, windowMs: 10 * 60 * 1000 }
const MESHY_SERVER_RATE = { limit: 12, windowMs: 60 * 60 * 1000 }

function countToolRounds(
  messages: { role: string; parts?: { type: string }[] }[],
) {
  return messages.filter(
    (message) =>
      message.role === "assistant" &&
      (message.parts ?? []).some((part) => part.type.startsWith("tool-")),
  ).length
}

export {
  CHAT_OWN_RATE,
  CHAT_SERVER_RATE,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TOOL_ROUNDS,
  MESHY_SERVER_RATE,
  countToolRounds,
}
