import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { CliSignIn } from "./cli-sign-in"

vi.mock("@/lib/pipeline", () => ({ loadConfig: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function serve(status: object) {
  const calls: { url: string; body?: string }[] = []
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? String(init.body) : undefined })
    if (url === "/api/meshy/cli") return Promise.resolve(Response.json(status))
    const body = JSON.parse(String(init?.body ?? "{}")) as { flowId?: string }
    if (!body.flowId) {
      return Promise.resolve(
        Response.json({
          flowId: "flow-1",
          url: "https://www.meshy.ai/oauth/device?code=ABCD-1234",
          code: "ABCD-1234",
        }),
      )
    }
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      )
    })
  })
  return calls
}

test("stays hidden where the app may not use a CLI sign-in", async () => {
  serve({ allowed: false })
  const { container } = render(<CliSignIn hasOwnKey={false} />)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(container.textContent).toBe("")
})

test("shows who the CLI is signed in as", async () => {
  serve({
    allowed: true,
    installed: true,
    signedIn: true,
    account: "Ada",
    credits: 1200,
  })
  render(<CliSignIn hasOwnKey={false} />)
  expect(
    await screen.findByText("Signed in as Ada · 1,200 credits"),
  ).toBeTruthy()
})

test("signing in shows the code and the page, and can be canceled", async () => {
  const calls = serve({ allowed: true, installed: true, signedIn: false })
  render(<CliSignIn hasOwnKey={false} />)
  fireEvent.click(
    await screen.findByRole("button", { name: "Sign in with Meshy" }),
  )
  expect(await screen.findByText("ABCD-1234")).toBeTruthy()
  const link = screen.getByRole("link", { name: "Open sign-in page" })
  expect(link.getAttribute("href")).toBe(
    "https://www.meshy.ai/oauth/device?code=ABCD-1234",
  )
  expect(calls.at(-1)?.body).toBe(JSON.stringify({ flowId: "flow-1" }))
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(
    await screen.findByRole("button", { name: "Sign in with Meshy" }),
  ).toBeTruthy()
  expect(screen.queryByRole("alert")).toBeNull()
})

test("points to the install command when the CLI is missing", async () => {
  serve({ allowed: true, installed: false, signedIn: false })
  render(<CliSignIn hasOwnKey={false} />)
  expect(await screen.findByText("npm install -g meshy-cli")).toBeTruthy()
})
