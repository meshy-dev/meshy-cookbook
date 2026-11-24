import { getAsset, isTaskKind, meshyAuth } from "@/lib/meshy"
import { failure } from "../../../respond"

async function GET(
  request: Request,
  { params }: RouteContext<"/api/meshy/asset/[kind]/[id]">,
) {
  const { kind, id } = await params
  const file = new URL(request.url).searchParams.get("file") ?? "model"
  if (!isTaskKind(kind)) {
    return Response.json({ error: "Unknown task kind" }, { status: 400 })
  }
  try {
    const asset = await getAsset(kind, id, file, meshyAuth(request))
    if (!asset.ok || !asset.body) {
      return Response.json({ error: "Download failed" }, { status: 502 })
    }
    return new Response(asset.body, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "private, max-age=86400, immutable",
      },
    })
  } catch (error) {
    return failure(error)
  }
}

export { GET }
