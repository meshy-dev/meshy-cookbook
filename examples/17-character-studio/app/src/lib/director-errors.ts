interface Found {
  status?: number
  text: string
}

/** AI Gateway errors nest the useful parts: a status code on the error and the
 * provider's JSON body on its cause. */
function inspect(error: unknown): Found {
  const parts: string[] = []
  let status: number | undefined
  let current: unknown = error
  for (let depth = 0; current && depth < 4; depth += 1) {
    const value = current as {
      message?: unknown
      statusCode?: unknown
      responseBody?: unknown
      cause?: unknown
    }
    if (typeof value.statusCode === "number") status ??= value.statusCode
    if (typeof value.message === "string") parts.push(value.message)
    if (typeof value.responseBody === "string") parts.push(value.responseBody)
    current = value.cause
  }
  return { status, text: parts.join(" ") }
}

/** What the page shows when the director's model call fails. The AI SDK sends
 * only "An error occurred." unless the route says more. */
function directorErrorMessage(error: unknown) {
  const { status, text } = inspect(error)
  if (/customer_verification_required|credit card on file/i.test(text)) {
    return "AI Gateway needs a credit card on the Vercel account behind this key before it runs models. Add one in Vercel's AI Gateway settings; that also unlocks its free credits."
  }
  if (status === 401) return "AI Gateway rejected the key. Check it under API keys."
  if (status === 402 || /insufficient[_ ]funds|out of credits/i.test(text)) {
    return "The Vercel account behind this AI Gateway key is out of credits."
  }
  if (status === 429) {
    return "AI Gateway is limiting requests right now. Try again in a minute."
  }
  return "The director couldn't reach the AI model. Try again."
}

export { directorErrorMessage }
