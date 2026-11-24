import type { LibraryAnimation } from "@/lib/types"

/** A few biped entries in the shape /api/meshy/library returns them. */
const testLibrary: LibraryAnimation[] = [
  { id: "0", name: "Idle", category: "DailyActions" },
  { id: "4", name: "Attack", category: "Fighting" },
  { id: "20", name: "Wave", category: "BodyMovements" },
  { id: "22", name: "Dance", category: "Dancing" },
]

export { testLibrary }
