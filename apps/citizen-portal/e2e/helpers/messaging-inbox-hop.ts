/**
 * Cross-zone hop from profile/dashboard onto messaging. The dashboard spec
 * waits 60s because that chain outlasts the 25s `expect` timeout. A 5s IdP
 * probe then a search wait misses a slow bounce and sits on the mock form
 * (nightly 117543, build 125157). Build 125209 then sat 60s on the Logto
 * consent screen, which has neither the search field nor the mock form.
 */
export const MESSAGING_INBOX_HOP_TIMEOUT_MS = 60_000

/**
 * Sign-in on screen means finish login. Logto's consent "Authorize" button
 * is a third screen on that hop. Otherwise the inbox shell is up.
 */
export function messagingInboxHopAction(
  signInVisible: boolean,
  authorizeVisible = false,
): "relogin" | "authorize" | "assert-shell" {
  if (signInVisible) return "relogin"
  if (authorizeVisible) return "authorize"
  return "assert-shell"
}
