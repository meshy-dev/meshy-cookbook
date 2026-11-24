"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { GATEWAY_KEY_HEADER } from "./gateway"
import { KEY_HEADER } from "./meshy-headers"

interface Keys {
  meshy: string
  gateway: string
  set: (keys: { meshy: string; gateway: string }) => void
}

/** A person's own API keys. They live in this browser's storage and go to
 * this app's server as headers; the server never stores them. */
const useKeys = create<Keys>()(
  persist(
    (set) => ({
      meshy: "",
      gateway: "",
      set: (keys) => set(keys),
    }),
    { name: "character-studio-keys", version: 1 },
  ),
)

function keyHeaders(
  keys: { meshy: string; gateway: string } = useKeys.getState(),
) {
  const headers: Record<string, string> = {}
  if (keys.meshy) headers[KEY_HEADER] = keys.meshy
  if (keys.gateway) headers[GATEWAY_KEY_HEADER] = keys.gateway
  return headers
}

export { keyHeaders, useKeys }
