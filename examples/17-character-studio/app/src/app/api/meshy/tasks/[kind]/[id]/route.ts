import { getTask, isTaskKind, meshyAuth } from "@/lib/meshy"
import { failure } from "../../../respond"

async function GET(
  request: Request,
  { params }: RouteContext<"/api/meshy/tasks/[kind]/[id]">,
) {
  const { kind, id } = await params
  if (!isTaskKind(kind)) {
    return Response.json({ error: "Unknown task kind" }, { status: 400 })
  }
  try {
    return Response.json(await getTask(kind, id, meshyAuth(request)))
  } catch (error) {
    return failure(error)
  }
}

export { GET }
