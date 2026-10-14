import { describe, expect, it } from "vitest"
import {
  MESSAGING_INBOX_HOP_TIMEOUT_MS,
  messagingInboxHopAction,
} from "../e2e/helpers/messaging-inbox-hop"

describe("messagingInboxHopAction", () => {
  it("relogs in when the IdP is on screen instead of waiting on search", () => {
    expect(messagingInboxHopAction(true)).toBe("relogin")
    expect(messagingInboxHopAction(true, true)).toBe("relogin")
    expect(messagingInboxHopAction(false)).toBe("assert-shell")
    expect(messagingInboxHopAction(false, true)).toBe("authorize")
    expect(MESSAGING_INBOX_HOP_TIMEOUT_MS).toBeGreaterThan(25_000)
  })
})
