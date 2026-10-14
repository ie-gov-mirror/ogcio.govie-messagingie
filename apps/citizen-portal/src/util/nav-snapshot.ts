import { useSyncExternalStore } from "react"

/**
 * Last unread count the side menu showed, shared across the zone hosts
 * (messaging / profile / dashboard). A cross-host move is a full page
 * load, so the next host reads it to draw the menu and badge straight
 * away instead of an empty sidebar and a spinner. The cookie is only
 * present while the menu is visible to a signed-in user.
 */
const UNREAD_COOKIE = "citizen_portal_nav_unread"
const NAME_COOKIE = "citizen_portal_nav_name"
const MAX_AGE_SECONDS = 60 * 60 * 12
const MAX_NAME_LENGTH = 200

const listeners = new Set<() => void>()

// ponytail: sign-out seals name writes for this document so an in-flight
// profile fetch cannot put the previous citizen's name back. The next page
// load starts unsealed. A failed sign-out that stays on the page will not
// refresh the name cache until reload.
let nameWritesSealed = false

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function sharedDomain(hostname: string): string | undefined {
  const parts = hostname.split(".")
  return parts.length >= 3 ? `.${parts.slice(1).join(".")}` : undefined
}

function cookieSuffix(maxAge: number): string {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  return `; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
}

/**
 * A host-only cookie and a parent-domain cookie can share a name, and one
 * assignment expires only one of them. The host-only copy is invisible to
 * other zone hosts and wins on this host, so messaging can keep showing the
 * previous citizen after profile has moved on (AB#44219).
 */
function expireCookie(name: string): void {
  const suffix = cookieSuffix(0)
  const domain = sharedDomain(window.location.hostname)
  for (let i = 0; i < 2; i++) {
    document.cookie = `${name}=${suffix}`
    if (domain) document.cookie = `${name}=${suffix}; domain=${domain}`
  }
}

function setCookie(name: string, value: string, maxAge: number) {
  if (maxAge === 0) {
    expireCookie(name)
    return
  }
  const suffix = cookieSuffix(maxAge)
  const domain = sharedDomain(window.location.hostname)
  if (domain) {
    expireCookie(name)
    document.cookie = `${name}=${value}${suffix}; domain=${domain}`
    return
  }
  document.cookie = `${name}=${value}${suffix}`
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const prefix = `${name}=`
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length)
  }
  return null
}

export function readNavSnapshot(): number | null {
  const raw = readCookie(UNREAD_COOKIE)
  if (raw == null) return null
  const count = Number(raw)
  return Number.isInteger(count) && count >= 0 ? count : null
}

export function writeNavSnapshot(count: number): void {
  if (typeof document === "undefined") return
  if (readNavSnapshot() === count) return
  setCookie(UNREAD_COOKIE, String(count), MAX_AGE_SECONDS)
}

function readNameRecord(): { sub: string | null; name: string | null } {
  const raw = readCookie(NAME_COOKIE)
  if (raw == null) return { sub: null, name: null }
  const pipe = raw.indexOf("|")
  try {
    if (pipe === -1) {
      const name = decodeURIComponent(raw).trim()
      return { sub: null, name: name || null }
    }
    const sub = decodeURIComponent(raw.slice(0, pipe))
    const name = decodeURIComponent(raw.slice(pipe + 1)).trim()
    if (!sub || !name) return { sub: null, name: null }
    return { sub, name }
  } catch {
    return { sub: null, name: null }
  }
}

/** Display name last shown in the top bar. Shared across zone hosts. */
export function readNavName(): string | null {
  return readNameRecord().name
}

function readNavSub(): string | null {
  return readNameRecord().sub
}

export function writeNavName(sub: string, name: string): void {
  if (nameWritesSealed) return
  if (typeof document === "undefined") return
  const trimmed = name.trim()
  if (!sub || !trimmed || trimmed.length > MAX_NAME_LENGTH) return
  if (readNavSub() === sub && readNavName() === trimmed) return
  setCookie(
    NAME_COOKIE,
    `${encodeURIComponent(sub)}|${encodeURIComponent(trimmed)}`,
    MAX_AGE_SECONDS,
  )
  emit()
}

/** Tests reopen name writes after a beforeEach clear. Sign-out stays sealed. */
export function unsealNavSnapshot(): void {
  nameWritesSealed = false
}

export function clearNavSnapshot(): void {
  if (typeof document === "undefined") return
  nameWritesSealed = true
  if (readNavSnapshot() === null && readNavName() === null) return
  if (readNavSnapshot() !== null) setCookie(UNREAD_COOKIE, "", 0)
  if (readNavName() !== null) setCookie(NAME_COOKIE, "", 0)
  emit()
}

const noopSubscribe = () => () => {}

/** Hydration-safe read: null in the static HTML, the cookie after hydration. */
export function useNavSnapshot(): number | null {
  return useSyncExternalStore(noopSubscribe, readNavSnapshot, () => null)
}

export function useNavName(): string | null {
  return useSyncExternalStore(subscribe, readNavName, () => null)
}

export function useNavSub(): string | null {
  return useSyncExternalStore(subscribe, readNavSub, () => null)
}
