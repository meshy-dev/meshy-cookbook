import { MeshyError, MissingKeyError } from "@/lib/meshy"

function failure(error: unknown) {
  if (error instanceof MissingKeyError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof MeshyError) {
    const message =
      error.status === 401
        ? "Meshy rejected the API key. Check it under API keys."
        : error.status === 402
          ? "Meshy needs more credits or a paid plan for this."
          : error.message
    return Response.json({ error: message }, { status: error.status })
  }
  console.error(error)
  return Response.json({ error: "Something went wrong" }, { status: 500 })
}

export { failure }
