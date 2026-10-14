import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

const { pushLog, chunkError } = vi.hoisted(() => ({
  pushLog: vi.fn(),
  chunkError: { isChunk: false, reloads: false },
}))

vi.mock("@grafana/faro-web-sdk", () => ({
  faro: { api: { pushLog } },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const messages: Record<string, string> = {
      title: "Something went wrong",
      paragraph: "Please try again.",
      button: "Retry",
    }
    return (key: string) => messages[key] ?? key
  },
}))

vi.mock("@/util/chunk-error", () => ({
  isChunkLoadError: () => chunkError.isChunk,
  reloadOnceIfChunkLoadError: () => chunkError.reloads,
}))

import ErrorPage from "./error"

beforeEach(() => {
  pushLog.mockClear()
  chunkError.isChunk = false
  chunkError.reloads = false
})

it("reports the error, renders its message, and retries", () => {
  const reset = vi.fn()

  render(<ErrorPage error={new Error("Request failed")} reset={reset} />)

  expect(screen.getByRole("alert")).toHaveTextContent("Request failed")
  expect(pushLog).toHaveBeenCalledWith(["Error: Request failed"])
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  expect(reset).toHaveBeenCalledOnce()
})

it("stays quiet while a recovery reload is scheduled", () => {
  chunkError.isChunk = true
  chunkError.reloads = true
  render(
    <ErrorPage error={new Error("Failed to load chunk")} reset={vi.fn()} />,
  )

  expect(pushLog).not.toHaveBeenCalled()
})

it("reports a chunk-load error once recovery is spent", () => {
  chunkError.isChunk = true
  chunkError.reloads = false
  render(
    <ErrorPage error={new Error("Failed to load chunk")} reset={vi.fn()} />,
  )

  expect(pushLog).toHaveBeenCalledWith(["ChunkLoadError: Failed to load chunk"])
})
