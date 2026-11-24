type TaskKind = "preview" | "refine" | "rig" | "animate" | "motion"

type TaskStatus =
  "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED"

interface Clip {
  id: string
  name: string
  url: string
}

interface TaskState {
  id: string
  kind: TaskKind
  status: TaskStatus
  progress: number
  error?: string
  modelUrl?: string
  clips?: Clip[]
  retryAfter: number
}

interface LibraryAnimation {
  id: string
  name: string
  category: string
  previewUrl?: string
}

type CreateTaskInput =
  | { kind: "preview"; prompt: string }
  | { kind: "refine"; previewTaskId: string }
  | { kind: "rig"; inputTaskId: string }
  | { kind: "animate"; rigTaskId: string; actionId: string; name: string }
  | { kind: "animate"; rigTaskId: string; motionTaskId: string; name: string }
  | { kind: "motion"; prompt: string; duration: number }

export type {
  Clip,
  CreateTaskInput,
  LibraryAnimation,
  TaskKind,
  TaskState,
  TaskStatus,
}
