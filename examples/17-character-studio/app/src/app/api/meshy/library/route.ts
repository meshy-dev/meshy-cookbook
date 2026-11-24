import { getLibrary, meshyAuth } from "@/lib/meshy"
import { failure } from "../respond"

async function GET(request: Request) {
  try {
    return Response.json(await getLibrary(meshyAuth(request)))
  } catch (error) {
    return failure(error)
  }
}

export { GET }
