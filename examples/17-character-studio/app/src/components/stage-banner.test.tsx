import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useStudio } from "@/lib/store"
import { StageBanner } from "./stage-banner"

const generateCharacter = vi.fn()

vi.mock("@/lib/pipeline", () => ({
  generateCharacter: (...args: unknown[]) => generateCharacter(...args),
}))

beforeEach(() => {
  generateCharacter.mockReset()
  useStudio.setState({
    characters: [
      {
        id: "old",
        prompt: "A weathered astronaut",
        stage: "ready",
        progress: 100,
        textured: true,
        expired: true,
        modelUrl: "/api/meshy/asset/rig/gone?file=model",
        clips: [],
      },
    ],
    activeId: "old",
  })
  render(<StageBanner />)
})

afterEach(cleanup)

test("an expired character can be cleared from the library", () => {
  expect(screen.getByText(/this character's files expired/i)).toBeTruthy()
  screen.getByRole("button", { name: "Remove from library" }).click()
  expect(useStudio.getState().characters).toHaveLength(0)
})

test("regenerate starts a new job from the saved prompt", () => {
  screen.getByRole("button", { name: "Regenerate" }).click()
  expect(generateCharacter).toHaveBeenCalledWith("A weathered astronaut")
  expect(useStudio.getState().characters).toHaveLength(0)
})

test("a failed rig keeps the last model on stage and names the error", () => {
  cleanup()
  useStudio.setState({
    characters: [
      {
        id: "partial",
        prompt: "A fox ranger",
        stage: "failed",
        progress: 0,
        textured: true,
        modelUrl: "/api/meshy/asset/refine/tex?file=model",
        error: "Rigging failed",
        clips: [],
      },
    ],
    activeId: "partial",
  })
  render(<StageBanner />)
  expect(screen.getByRole("alert").textContent).toMatch(/rigging failed/i)
  expect(screen.getByRole("alert").textContent).toMatch(/last completed stage/i)
})
