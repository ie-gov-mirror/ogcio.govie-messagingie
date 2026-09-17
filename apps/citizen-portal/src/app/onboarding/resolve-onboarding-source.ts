import { getValidReturnUrl } from "@/util/valid-return-url"

/** Reject untrusted sources and sources that point back to onboarding. */
export function resolveOnboardingSource(
  rawSource: string | null,
  trustedOrigins: readonly string[],
): string | null {
  const source = getValidReturnUrl(rawSource, trustedOrigins)
  if (!source) return null

  let pathname: string
  try {
    pathname = decodeURIComponent(
      new URL(source, "https://relative.invalid").pathname,
    )
  } catch {
    return null
  }
  if (pathname === "/onboarding" || pathname.endsWith("/onboarding")) {
    return null
  }
  return source
}
