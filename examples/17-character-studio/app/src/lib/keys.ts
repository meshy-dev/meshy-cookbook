"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { ANTHROPIC_KEY_HEADER } from "./anthropic-headers"
import { GATEWAY_KEY_HEADER } from "./gateway"
import { KEY_HEADER } from "./meshy-headers"

interface SavedKeys {
  meshy: string
  gateway: string
  anthropic: string
}

interface Keys extends SavedKeys {
  set: (keys: SavedKeys) => void
}

/** A person's own API keys. They live in this browser's storage and go to
 * this app's server as headers; the server never stores them. */
const useKeys = create<Keys>()(
  persist(
    (set) => ({
      meshy: "",
      gateway: "",
      anthropic: "",
      set: (keys) => set(keys),
    }),
    { name: "character-studio-keys", version: 1 },
  ),
)

function keyHeaders(keys: SavedKeys = useKeys.getState()) {
  const headers: Record<string, string> = {}
  if (keys.meshy) headers[KEY_HEADER] = keys.meshy
  if (keys.gateway) headers[GATEWAY_KEY_HEADER] = keys.gateway
  if (keys.anthropic) headers[ANTHROPIC_KEY_HEADER] = keys.anthropic
  return headers
}

export { keyHeaders, useKeys }
export type { SavedKeys }
