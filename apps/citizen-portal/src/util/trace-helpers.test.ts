import { beforeEach, describe, expect, it, vi } from "vitest"

const getOTEL = vi.hoisted(() => vi.fn())

vi.mock("@grafana/faro-web-sdk", () => ({
  faro: { api: { getOTEL } },
}))

import { withFaroSpan } from "./trace-helpers"

describe("withFaroSpan", () => {
  beforeEach(() => getOTEL.mockReset())

  it("runs directly when tracing is unavailable", async () => {
    getOTEL.mockReturnValue(undefined)
    const operation = vi.fn().mockResolvedValue("done")

    await expect(withFaroSpan("load", {}, operation)).resolves.toBe("done")
    expect(operation).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    "sets attributes and always ends the span",
    async (fails) => {
      const span = { setAttribute: vi.fn(), end: vi.fn() }
      const trace = {
        getTracer: vi.fn(() => ({ startSpan: vi.fn(() => span) })),
        setSpan: vi.fn(() => "span-context"),
      }
      const context = {
        active: vi.fn(() => "active-context"),
        with: vi.fn((_context, operation: () => Promise<unknown>) =>
          operation(),
        ),
      }
      getOTEL.mockReturnValue({ trace, context })
      const operation = fails
        ? vi.fn().mockRejectedValue(new Error("failed"))
        : vi.fn().mockResolvedValue("done")

      if (fails) {
        await expect(
          withFaroSpan("load", { messageId: "one" }, operation),
        ).rejects.toThrow("failed")
      } else {
        await expect(
          withFaroSpan("load", { messageId: "one" }, operation),
        ).resolves.toBe("done")
      }

      expect(span.setAttribute).toHaveBeenCalledWith("messageId", "one")
      expect(span.end).toHaveBeenCalledOnce()
    },
  )
})
