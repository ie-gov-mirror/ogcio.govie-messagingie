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

function setCookie(name: string, value: string, maxAge: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  const base = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
  document.cookie = base
  const domain = sharedDomain(window.location.hostname)
  if (domain) document.cookie = `${base}; domain=${domain}`
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

/** Display name last shown in the top bar. Shared across zone hosts. */
export function readNavName(): string | null {
  const raw = readCookie(NAME_COOKIE)
  if (raw == null) return null
  try {
    const name = decodeURIComponent(raw).trim()
    return name || null
  } catch {
    return null
  }
}

export function writeNavName(name: string): void {
  if (typeof document === "undefined") return
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return
  if (readNavName() === trimmed) return
  setCookie(NAME_COOKIE, encodeURIComponent(trimmed), MAX_AGE_SECONDS)
  emit()
}

export function clearNavSnapshot(): void {
  if (typeof document === "undefined") return
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
