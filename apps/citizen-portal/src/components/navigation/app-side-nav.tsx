"use client"

import { Paragraph, SideNav, SideNavItem } from "@ogcio/design-system-react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react"
import {
  InboxUnreadBadge,
  UnreadBadgeView,
} from "@/components/messages/inbox-unread-badge"
import { useInboxUnreadCount } from "@/components/messages/use-inbox-unread-count"
import { useApplicationLinksState } from "@/hooks/use-show-application-links"
import { isLeaEnabled } from "@/lib/feature-config"
import { useNavSnapshot, writeNavSnapshot } from "@/util/nav-snapshot"
import styles from "./app-side-nav.module.css"
import {
  type AppNavItem,
  activeAppNavId,
  useAppNavItems,
} from "./use-app-nav-items"
import { useClientHref } from "./use-client-href"

/**
 * Desktop application nav shown when LEA is on. Hidden below 640px; the
 * header drawer covers the same destinations on small screens.
 *
 * This component stays mounted across same-origin page changes. Only the
 * unread badge re-renders when its count changes.
 *
 * `placeholder` is the copy drawn while sign-in resolves after a
 * cross-host page load: it shows the last count the menu showed and
 * makes no gateway calls.
 */
export function AppSideNav({ placeholder = false }: { placeholder?: boolean }) {
  const t = useTranslations("navigation.header")
  const path = usePathname()
  const links = useApplicationLinksState()
  const showLinks = links === true
  const items = useAppNavItems()
  const snapshot = useNavSnapshot()
  const hasMessages = items.some((item) => item.id === "messages")
  const unread = useInboxUnreadCount(!placeholder && showLinks && hasMessages)
  const navRef = useRef<HTMLElement>(null)
  const activeId = activeAppNavId(path)

  useEffect(() => {
    if (placeholder || !isLeaEnabled() || !showLinks || unread.isLoading) return
    writeNavSnapshot(unread.count)
  }, [placeholder, showLinks, unread.isLoading, unread.count])

  // ponytail: design-system SideNav stores the selected id on first render
  // and ignores later `value` updates. Mirror the selected class onto the
  // anchors so a client navigation can move the highlight without remounting
  // the nav (a remount flashes the unread spinner). Upgrade path: a SideNav
  // that treats `value` as controlled.
  useLayoutEffect(() => {
    const root = navRef.current
    if (!root) return
    for (const link of root.querySelectorAll("a")) {
      const selected = activeId != null && link.id.endsWith(`-${activeId}`)
      link.classList.toggle("gi-side-nav-item-selected", selected)
    }
  })

  const visible = placeholder ? snapshot != null : (links ?? snapshot != null)
  if (!isLeaEnabled() || !visible) return null

  const badge = placeholder ? (
    <UnreadBadgeView count={snapshot ?? 0} />
  ) : (
    <InboxUnreadBadge />
  )

  return (
    <nav ref={navRef} className={styles.nav} aria-label={t("sideNav")}>
      <SideNav value={activeId}>
        {items.map((item) => (
          <NavDestination
            key={item.id}
            item={item}
            badge={item.id === "messages" ? badge : undefined}
          />
        ))}
      </SideNav>
    </nav>
  )
}

function NavDestination({
  item,
  badge,
}: {
  item: AppNavItem
  badge?: ReactNode
}) {
  const client = useClientHref(item.href)
  if (!client.onClick) {
    return (
      <SideNavItem
        value={item.id}
        href={item.href}
        label={item.label}
        actions={badge}
      />
    )
  }
  return (
    <SideNavItem
      value={item.id}
      href={client.href}
      label={item.label}
      asChild
      actions={badge}
    >
      <a href={client.href} onClick={client.onClick}>
        {/* Same label the design system renders, so this item keeps its
            font size. A bare text child inherits the button size instead. */}
        <span className='gi-side-nav-item-label gi-flex-1'>
          <Paragraph size='md'>{item.label}</Paragraph>
        </span>
      </a>
    </SideNavItem>
  )
}
