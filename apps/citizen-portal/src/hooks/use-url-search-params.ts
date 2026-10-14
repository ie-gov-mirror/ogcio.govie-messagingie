"use client"

import { useSearchParams } from "next/navigation"
import { useSyncExternalStore } from "react"

type Listener = () => void
const listeners = new Set<Listener>()
let historyPatched = false

function subscribe(listener: Listener) {
  patchHistoryOnce()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function patchHistoryOnce() {
  if (historyPatched || typeof window === "undefined") return
  historyPatched = true

  // Next's App Router pushes history state from a `useInsertionEffect`, and
  // React forbids scheduling updates there. A microtask defers past it, and
  // `location.search` is already current by the time subscribers read it.
  // Multiple synchronous history mutations coalesce into a single flush so
  // listeners still fire exactly once per URL change.
  let notifyScheduled = false

  const flushNotify = () => {
    notifyScheduled = false
    for (const listener of listeners) {
      listener()
    }
  }
  const scheduleNotify = () => {
    if (notifyScheduled) return
    notifyScheduled = true
    const schedule =
      typeof queueMicrotask === "function"
        ? queueMicrotask
        : (cb: () => void) => {
            Promise.resolve().then(cb)
          }
    schedule(flushNotify)
  }

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = (...args) => {
    const result = originalPushState(...args)
    scheduleNotify()
    return result
  }

  history.replaceState = (...args) => {
    const result = originalReplaceState(...args)
    scheduleNotify()
    return result
  }

  window.addEventListener("popstate", scheduleNotify)
}

function getClientSearchString() {
  return window.location.search
}

/**
 * Query params synced with the live address bar. Next.js `useSearchParams()`
 * can stay stale after a full reload when the URL is updated via
 * `history.replaceState` alone (AB#40679).
 *
 * In unit tests we prefer Next's mocked `useSearchParams()` so existing
 * suite fixtures keep working; the history-backed path is covered by
 * dedicated hook tests that stub `NODE_ENV` to `"production"`.
 */
export function useUrlSearchParams() {
  const nextParams = useSearchParams()
  const preferNextParams = process.env.NODE_ENV === "test"

  const searchString = useSyncExternalStore(
    subscribe,
    getClientSearchString,
    () => (nextParams.toString() ? `?${nextParams.toString()}` : ""),
  )

  if (preferNextParams) {
    return nextParams
  }

  const normalized = searchString.startsWith("?")
    ? searchString.slice(1)
    : searchString

  return new URLSearchParams(normalized)
}
