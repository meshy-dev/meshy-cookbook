"use client"

import { usePointer } from "@/lib/agent"

function AgentPointer() {
  const { rect, label, detail, visible } = usePointer()
  if (!rect) return null
  const pad = 6
  return (
    <div
      aria-hidden="true"
      className="agent-pointer"
      data-visible={visible ? "" : undefined}
      style={{
        transform: `translate(${rect.x - pad}px, ${rect.y - pad}px)`,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }}
    >
      <span className="agent-pointer-tag">
        <span className="agent-pointer-dot" />
        {label}
        {detail ? <em>{detail}</em> : null}
      </span>
    </div>
  )
}

export { AgentPointer }
