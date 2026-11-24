import { z } from "zod"
import { admitMeshyTask } from "@/lib/guard"
import { createTask, meshyAuth } from "@/lib/meshy"
import { failure } from "../respond"

const id = z.string().min(1).max(400)
const name = z.string().max(120)

const input = z.union([
  z.object({ kind: z.literal("preview"), prompt: z.string().min(3).max(600) }),
  z.object({ kind: z.literal("refine"), previewTaskId: id }),
  z.object({ kind: z.literal("rig"), inputTaskId: id }),
  z.object({
    kind: z.literal("animate"),
    rigTaskId: id,
    actionId: z.string().max(40),
    name,
  }),
  z.object({
    kind: z.literal("animate"),
    rigTaskId: id,
    motionTaskId: id,
    name,
  }),
  z.object({
    kind: z.literal("motion"),
    prompt: z.string().min(3).max(400),
    duration: z.number().min(2).max(10).multipleOf(0.5),
  }),
])

async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const access = admitMeshyTask(request)
  if (!access.ok) {
    return Response.json(
      { error: access.error },
      {
        status: access.status,
        headers: access.retryAfter
          ? { "Retry-After": String(access.retryAfter) }
          : undefined,
      },
    )
  }
  try {
    return Response.json({
      id: await createTask(parsed.data, meshyAuth(request)),
    })
  } catch (error) {
    return failure(error)
  }
}

export { POST }
