import type { ComponentProps } from "react"

/** Marks where the agent pointer lands for the control with this label. */
function Anchor({
  label,
  ...props
}: { label: string } & ComponentProps<"div">) {
  return <div data-agent-anchor={label} {...props} />
}

export { Anchor }
