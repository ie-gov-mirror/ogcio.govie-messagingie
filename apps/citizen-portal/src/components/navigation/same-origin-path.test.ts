import { describe, expect, it } from "vitest"
import { sameOriginPath } from "./same-origin-path"

const dashboard = "http://dashboard.local.test:8080"

describe("sameOriginPath", () => {
  it("keeps an in-app path", () => {
    expect(sameOriginPath("/en/discovery/child", dashboard)).toBe(
      "/en/discovery/child",
    )
  })

  it("reduces an absolute url on the current host to a path", () => {
    expect(
      sameOriginPath(`${dashboard}/en/discovery?q=1#top`, dashboard),
    ).toBe("/en/discovery?q=1#top")
  })

  it("leaves a different host for a full document load", () => {
    expect(
      sameOriginPath(
        "http://messaging.local.test:8080/en/messages",
        dashboard,
      ),
    ).toBeNull()
  })
})
