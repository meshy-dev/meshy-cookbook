import { cliStatus } from "@/lib/meshy-cli"
import { cliAllowed } from "@/lib/paid"

/** Who the Meshy CLI on this computer is signed in as, and their balance. */
async function GET() {
  if (!cliAllowed()) return Response.json({ allowed: false })
  return Response.json({ allowed: true, ...(await cliStatus()) })
}

export { GET }
