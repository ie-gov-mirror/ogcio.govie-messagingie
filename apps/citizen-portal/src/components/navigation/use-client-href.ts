"use client"

import { useEnv } from "@citizen-portal/shared"
import { usePathname, useRouter } from "next/navigation"
import type { MouseEvent } from "react"
import { getZoneFromPath } from "@/util/get-zone-from-path"
import { sameOriginPath } from "./same-origin-path"

export function isModifiedClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
}

/**
 * Same-origin hrefs become an App Router push so the authenticated shell
 * (and the side menu) stay mounted. Cross-origin hrefs are unchanged.
 */
export function useClientHref(href: string): {
  href: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const { hosts } = useEnv()
  const origin = new URL(hosts[getZoneFromPath(pathname)]).origin
  const local = sameOriginPath(href, origin)
  if (local == null) return { href }

  return {
    href: local,
    onClick: (event) => {
      if (isModifiedClick(event)) return
      event.preventDefault()
      router.push(local)
    },
  }
}
