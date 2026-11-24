type Env = Record<string, string | undefined>

type MeshyAuth = { kind: "key"; key: string } | { kind: "cli" }

function envFlag(name: string, env: Env = process.env) {
  const value = env[name]?.trim().toLowerCase()
  return value === "true" || value === "1" || value === "yes"
}

function serverChatEnabled(env: Env = process.env) {
  return (
    envFlag("ALLOW_SERVER_CHAT", env) &&
    Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN)
  )
}

function serverMeshyEnabled(env: Env = process.env) {
  return envFlag("ALLOW_SERVER_MESHY", env) && Boolean(env.MESHY_API_KEY)
}

function resolveMeshyKey(
  own: string | null | undefined,
  env: Env = process.env,
) {
  const key = own?.trim()
  if (key && key.length <= 200 && !/\s/.test(key)) return key
  if (serverMeshyEnabled(env)) return env.MESHY_API_KEY
  return undefined
}

/** The Meshy CLI's sign-in belongs to whoever runs the server, so the app uses
 * it under `next dev`, which listens only on this computer, or when the
 * server may pay for Meshy anyway. */
function cliAllowed(env: Env = process.env) {
  return env.NODE_ENV === "development" || envFlag("ALLOW_SERVER_MESHY", env)
}

/** A key the person sent, then the server's key, then the CLI's sign-in. */
function resolveMeshyAuth(
  own: string | null | undefined,
  env: Env = process.env,
): MeshyAuth | undefined {
  const key = resolveMeshyKey(own, env)
  if (key) return { kind: "key", key }
  if (cliAllowed(env)) return { kind: "cli" }
  return undefined
}

export {
  cliAllowed,
  envFlag,
  resolveMeshyAuth,
  resolveMeshyKey,
  serverChatEnabled,
  serverMeshyEnabled,
}
export type { MeshyAuth }
