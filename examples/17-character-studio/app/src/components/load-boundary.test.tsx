import { render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { LoadBoundary } from "./load-boundary"

function Boom(): never {
  throw new Error("bad glb")
}

test("LoadBoundary keeps a failed load from escaping", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  const onError = vi.fn()
  render(
    <LoadBoundary onError={onError} fallback={<p>expired, regenerate</p>}>
      <Boom />
    </LoadBoundary>,
  )
  expect(screen.getByText("expired, regenerate")).toBeTruthy()
  expect(onError).toHaveBeenCalled()
  spy.mockRestore()
})
