import { cliSignedIn } from "@/lib/meshy-cli"
import { cliAllowed, serverChatEnabled, serverMeshyEnabled } from "@/lib/paid"

/** Which keys this deployment will pay for, so the page knows what a visitor
 * still needs to bring. Presence of a key is not enough: server-paid Meshy
 * and chat are off until ALLOW_SERVER_MESHY / ALLOW_SERVER_CHAT are set. The
 * Meshy CLI's sign-in counts only where cliAllowed says so. */
async function GET() {
  const key = serverMeshyEnabled()
  const cli = !key && cliAllowed() ? await cliSignedIn() : false
  return Response.json({
    meshy: key || cli,
    meshySource: key ? "key" : cli ? "cli" : null,
    cli: cliAllowed(),
    agent: serverChatEnabled(),
  })
}

export { GET }
