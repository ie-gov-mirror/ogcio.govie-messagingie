"use client"

import { Link, type LinkProps } from "@ogcio/design-system-react"
import type { MouseEvent, ReactNode } from "react"
import { useClientHref } from "./use-client-href"

/**
 * Design-system link that client-navigates when the href is already on
 * this zone's host. Icons and the rest of the link props stay intact.
 */
export function AppLink({
  href,
  onClick,
  children,
  ...props
}: LinkProps & { href: string; children: ReactNode }) {
  const client = useClientHref(href)
  return (
    <Link
      {...props}
      href={client.href}
      onClick={(event: MouseEvent<HTMLElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        client.onClick?.(event)
      }}
    >
      {children}
    </Link>
  )
}
