const RELATIVE_URL_BASE = "https://relative.invalid"

/**
 * Validates an externally-supplied `returnUrl` / `postRedirectUri` /
 * `?redirect=` query parameter. Returns the original string only when it is a
 * root-relative path or its origin matches a configured application URL.
 *
 * The configured URLs are the citizen portal's explicit subset of SAG's
 * trusted application origins. `@ogcio/sag-client` does not currently export
 * SAG's origin validator, so using configuration here avoids a second broad
 * hostname policy.
 */
export function getValidReturnUrl(
  raw: string | null | undefined,
  trustedOrigins: readonly string[],
): string | null {
  if (raw == null || !raw.trim() || raw !== raw.trim()) {
    return null
  }

  try {
    if (raw.startsWith("/")) {
      const url = new URL(raw, RELATIVE_URL_BASE)
      return url.origin === RELATIVE_URL_BASE ? raw : null
    }

    const url = new URL(raw)
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null
    }

    const allowed = trustedOrigins.some((origin) => {
      try {
        return new URL(origin).origin === url.origin
      } catch {
        return false
      }
    })
    return allowed ? raw : null
  } catch {
    return null
  }
}
