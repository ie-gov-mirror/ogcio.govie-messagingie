import { beforeEach, describe, expect, it } from "vitest"

import { LoginTracker } from "@/components/analytics/login-tracker"
import { fakeAnalytics } from "../../../test/utils/analytics"

const analytics = fakeAnalytics()
const { render } = analytics
const trackEvent = analytics.event

describe("LoginTracker", () => {
  beforeEach(() => {
    trackEvent.mockClear()
    sessionStorage.clear()
  })

  it("fires user-login once on mount", () => {
    render(<LoginTracker />)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({
      event: {
        name: "user-login",
        category: "User",
        action: "Login",
      },
    })
  })

  it("does not fire again within the same session", () => {
    sessionStorage.setItem("citizen_portal_login_tracked", "1")
    render(<LoginTracker />)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
