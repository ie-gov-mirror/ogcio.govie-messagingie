import { render, screen } from "@testing-library/react"
import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

const cookieGet = vi.fn()

function settledCookies() {
  const store = { get: cookieGet }
  const thenable = Promise.resolve(store) as Promise<typeof store> & {
    status: "fulfilled"
    value: typeof store
  }
  thenable.status = "fulfilled"
  thenable.value = store
  return thenable
}

vi.mock("next/headers", () => ({
  cookies: () => settledCookies(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import Layout from "./layout"

describe("auth error layout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends a session cookie home", () => {
    cookieGet.mockReturnValue({ value: "session-jwt" })

    expect(() =>
      render(
        <Layout>
          <p>error body</p>
        </Layout>,
      ),
    ).toThrow("NEXT_REDIRECT:/")
    expect(redirect).toHaveBeenCalledWith("/")
  })

  it("renders the error page when there is no session cookie", () => {
    cookieGet.mockReturnValue(undefined)

    render(
      <Layout>
        <p>error body</p>
      </Layout>,
    )

    expect(screen.getByText("error body")).toBeInTheDocument()
    expect(screen.getByText("Authentication Error")).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })
})
