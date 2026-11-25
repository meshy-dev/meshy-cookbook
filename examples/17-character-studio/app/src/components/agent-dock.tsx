"use client"

import { useChat } from "@ai-sdk/react"
import { Button } from "@ui-sdk/react/button"
import type { AgentStep } from "@ui-sdk/react/agent"
import { Input } from "@ui-sdk/react/input"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { ArrowUpIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { actVisibly, describe, getAgent } from "@/lib/agent"
import { keyHeaders } from "@/lib/keys"
import { MAX_CHAT_TOOL_ROUNDS, countToolRounds } from "@/lib/limits"
import { useStudio } from "@/lib/store"

const SUGGESTIONS = [
  "Make it dance under night lights",
  "Close-up on the face, then wave",
  "Turn it gold and spin the camera",
]

interface ToolPart {
  type: string
  toolCallId?: string
}

function AgentDock() {
  const agentAvailable = useStudio((state) => state.agentAvailable)
  const [input, setInput] = useState("")
  const [steps, setSteps] = useState<Record<string, string[]>>({})
  const log = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => keyHeaders(),
    }),
    sendAutomaticallyWhen: (options) => {
      if (countToolRounds(options.messages) >= MAX_CHAT_TOOL_ROUNDS) {
        return false
      }
      return lastAssistantMessageIsCompleteWithToolCalls(options)
    },
    async onToolCall({ toolCall }) {
      const agent = getAgent()
      const tool = toolCall.toolName as "snapshot" | "act" | "query"
      if (tool === "act") {
        const input = toolCall.input as { steps?: AgentStep[] }
        const text = (input.steps ?? []).map((step) => {
          const { label, detail } = describe(step)
          return `${label} → ${detail}`
        })
        setSteps((all) => ({ ...all, [toolCall.toolCallId]: text }))
      }
      const output =
        tool === "act"
          ? await actVisibly(toolCall.input as never)
          : tool === "snapshot"
            ? agent.snapshot()
            : await agent.query(toolCall.input as never)
      void addToolOutput({
        tool: tool as never,
        toolCallId: toolCall.toolCallId,
        output: output as never,
      })
    },
  })

  useEffect(() => {
    getAgent()
  }, [])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages])

  const busy = status === "submitted" || status === "streaming"

  const submit = (text: string) => {
    if (!text.trim() || busy) return
    void sendMessage({ text: text.trim() })
    setInput("")
  }

  return (
    <div className="dock" data-agent-hidden>
      {messages.length > 0 || error ? (
        <div className="dock-log" ref={log} aria-live="polite">
          {messages.map((message) => (
            <div
              key={message.id}
              className="dock-message"
              data-role={message.role}
            >
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return <p key={index}>{part.text}</p>
                }
                const tool = part as ToolPart
                const done = steps[tool.toolCallId ?? ""]
                if (tool.type !== "tool-act" || !done) return null
                return (
                  <ul key={index} className="dock-steps">
                    {done.map((text, at) => (
                      <li key={at}>{text}</li>
                    ))}
                  </ul>
                )
              })}
            </div>
          ))}
          {error ? (
            <p className="notice" data-tone="error">
              The director is unavailable: {error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="dock-suggestions">
          {agentAvailable
            ? SUGGESTIONS.map((text) => (
                <button key={text} type="button" onClick={() => submit(text)}>
                  {text}
                </button>
              ))
            : null}
        </div>
      )}
      <form
        className="dock-bar"
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
      >
        <Input
          aria-label="Message the director"
          value={input}
          onValueChange={(value) => setInput(value)}
          placeholder={
            agentAvailable
              ? "Direct the scene: “make it dance, zoom in, turn it gold”"
              : "Add an AI Gateway or Anthropic API key under API keys to direct by chat"
          }
          disabled={!agentAvailable}
        />
        <Button
          type="submit"
          aria-label="Send"
          className="send-button"
          disabled={!agentAvailable || busy || !input.trim()}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
      </form>
    </div>
  )
}

export { AgentDock }
