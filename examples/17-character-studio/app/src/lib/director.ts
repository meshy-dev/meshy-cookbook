import { createAnthropic } from "@ai-sdk/anthropic"
import { createGateway, type LanguageModel } from "ai"

type Env = Record<string, string | undefined>

/** A key the person sent from their browser for the director. */
interface DirectorKey {
  kind: "gateway" | "anthropic"
  key: string
}

interface DirectorChoice {
  provider: "gateway" | "anthropic"
  source: "own" | "server"
  modelId: string
  key?: string
}

const GATEWAY_MODEL = "anthropic/claude-sonnet-5.5"
const ANTHROPIC_MODEL = "claude-sonnet-5-5"

/** The person's own key first, otherwise the server's, which admitChat has
 * already checked it may spend. Either way, a direct Anthropic key comes before
 * AI Gateway: it is the more specific choice. */
function chooseDirector(
  own: DirectorKey | undefined,
  env: Env,
): DirectorChoice {
  const gatewayModel = env.AGENT_MODEL?.trim() || GATEWAY_MODEL
  const anthropicModel = env.AGENT_ANTHROPIC_MODEL?.trim() || ANTHROPIC_MODEL
  if (own) {
    return {
      provider: own.kind,
      source: "own",
      modelId: own.kind === "gateway" ? gatewayModel : anthropicModel,
      key: own.key,
    }
  }
  if (env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      source: "server",
      modelId: anthropicModel,
      key: env.ANTHROPIC_API_KEY,
    }
  }
  return { provider: "gateway", source: "server", modelId: gatewayModel }
}

function directorModel(
  own: DirectorKey | undefined,
  env: Env = process.env,
): { model: LanguageModel; provider: DirectorChoice["provider"] } {
  const choice = chooseDirector(own, env)
  if (choice.provider === "gateway") {
    return {
      provider: "gateway",
      model: choice.key
        ? createGateway({ apiKey: choice.key })(choice.modelId)
        : choice.modelId,
    }
  }
  // The key is always passed: left out, the provider would read
  // ANTHROPIC_API_KEY from the server's environment.
  return {
    provider: "anthropic",
    model: createAnthropic({ apiKey: choice.key ?? "" })(choice.modelId),
  }
}

export { chooseDirector, directorModel }
export type { DirectorKey }
