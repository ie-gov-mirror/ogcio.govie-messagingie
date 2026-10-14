import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { SwrProvider } from "./swr-provider"

const middleware = vi.hoisted(() => vi.fn())
const configSpy = vi.hoisted(() => vi.fn())

vi.mock("@/lib/swr-focus-revalidation", () => ({
  focusRevalidationByEndpoint: middleware,
}))

vi.mock("swr", () => ({
  SWRConfig: ({ children, value }: { children: ReactNode; value: unknown }) => {
    configSpy(value)
    return <>{children}</>
  },
}))

describe("SwrProvider", () => {
  it("disables default focus revalidation and installs endpoint middleware", () => {
    render(
      <SwrProvider>
        <span>content</span>
      </SwrProvider>,
    )

    expect(screen.getByText("content")).toBeInTheDocument()
    expect(configSpy).toHaveBeenCalledWith({
      revalidateOnFocus: false,
      use: [middleware],
    })
  })
})
