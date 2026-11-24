"use client"

import { createAgent, type AgentStep } from "@ui-sdk/react/agent"
import { create } from "zustand"
import { useStudio } from "./store"

type Bridge = ReturnType<typeof createAgent>

let bridge: Bridge | undefined

function getAgent() {
  bridge ??= createAgent()
  return bridge
}

interface Pointer {
  label: string
  detail: string
  rect: { x: number; y: number; width: number; height: number } | null
  visible: boolean
}

const usePointer = create<Pointer>(() => ({
  label: "",
  detail: "",
  rect: null,
  visible: false,
}))

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let hideTimer: ReturnType<typeof setTimeout> | undefined

/** A step in the words on screen: the control's label and the choice's name,
 * whichever of ref, label, value or item label the agent sent. */
function describe(step: AgentStep) {
  const entry = getAgent()
    .snapshot()
    .find(
      (item) =>
        item.ref === step.ref ||
        item.label?.toLowerCase() === step.ref.toLowerCase(),
    )
  const label = entry?.label ?? step.ref
  const items = [
    ...(entry?.items ?? []),
    ...(label === "Animation"
      ? useStudio
          .getState()
          .library.map((item) => ({ value: item.id, label: item.name }))
      : []),
  ]
  const args = (step.args ?? []).map((arg) => {
    const item = items.find((item) => String(item.value) === String(arg))
    if (item?.label) return item.label
    if (typeof arg === "boolean") return arg ? "on" : "off"
    return typeof arg === "string" ? arg : JSON.stringify(arg)
  })
  const pressed = args[0] && args[0] !== label ? `press ${args[0]}` : "press"
  const detail =
    step.action === "press"
      ? pressed
      : args.length
        ? args.join(", ")
        : step.action
  return { label, detail }
}

/** Moves the on-screen pointer to the control a step is about to change. */
async function point(step: AgentStep) {
  const { label, detail } = describe(step)
  const anchor = [
    ...document.querySelectorAll<HTMLElement>("[data-agent-anchor]"),
  ].find(
    (element) =>
      element.dataset.agentAnchor?.toLowerCase() === label.toLowerCase(),
  )
  clearTimeout(hideTimer)
  if (!anchor) {
    usePointer.setState({ label, detail, visible: false })
    return
  }
  anchor.scrollIntoView({ block: "nearest", behavior: "smooth" })
  await wait(120)
  const box = anchor.getBoundingClientRect()
  usePointer.setState({
    label,
    detail,
    rect: { x: box.x, y: box.y, width: box.width, height: box.height },
    visible: true,
  })
  await wait(420)
}

type ActInput = Parameters<Bridge["act"]>[0]
type ActResult = Awaited<ReturnType<Bridge["act"]>>

/** Runs steps one at a time so people can watch each control change. */
async function actVisibly(input: ActInput): Promise<ActResult> {
  const agent = getAgent()
  const steps: ActResult["steps"] = []
  let last: ActResult | undefined
  for (const [index, step] of input.steps.entries()) {
    await point(step)
    last = await agent.act({ steps: [step] })
    steps.push(...last.steps.map((item) => ({ ...item, step: index })))
    if (!last.ok) {
      console.warn("[agent] step failed:", step, last.error?.message)
      last = {
        ...last,
        error: last.error ? { ...last.error, step: index } : last.error,
      }
      break
    }
    await wait(380)
  }
  hideTimer = setTimeout(() => usePointer.setState({ visible: false }), 1400)
  return { ...(last ?? ({ ok: true } as ActResult)), steps }
}

export { actVisibly, describe, getAgent, usePointer }
