"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import {
  DrawerBody,
  DrawerWrapper,
  HeaderLogo,
  HeaderMenuItemButton,
  HeaderMenuItemLink,
  HeaderMenuItemSlot,
  HeaderNext,
  HeaderPrimaryMenu,
  HeaderSecondaryMenu,
  HeaderTitle,
  ListItem,
} from "@ogcio/design-system-react"
import { LogoHarpWhite, LogoWhite } from "@ogcio/design-system-react/logos"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { InboxUnreadBadge } from "@/components/messages/inbox-unread-badge"
import { useInboxUnreadCount } from "@/components/messages/use-inbox-unread-count"
import { LANG_EN, LANG_GA } from "@/const"
import { useActiveLocale } from "@/hooks/use-active-locale"
import { useShowApplicationLinks } from "@/hooks/use-show-application-links"
import { isLeaEnabled } from "@/lib/feature-config"
import { ZONE_CONFIG } from "@/lib/zone-config"
import { getZoneFromPath } from "@/util/get-zone-from-path"
import { clearNavSnapshot } from "@/util/nav-snapshot"
import { HeaderGreeting } from "./header-greeting"
import styles from "./page-header.module.css"
import { type AppNavItem, useAppNavItems } from "./use-app-nav-items"
import { useClientHref } from "./use-client-href"
import { UserMenuDrawer } from "./user-menu-drawer"

/**
 * Shared header for every authenticated zone.
 *
 * LEA on (desktop): greeting and language in the top bar, Profile in the
 * primary slot, destinations in the side nav. LEA off: language only in
 * the top bar, with a Menu button that opens the drawer.
 * An explicit `title` (onboarding) keeps the service-title chrome.
 */
export function PageHeader({
  publicName,
  onSignOut,
  title,
  logoHref,
  languageHref: languageHrefOverride,
}: {
  /** Usually `<PublicName>`; a plain string for pre-profile surfaces. */
  publicName: ReactNode
  onSignOut: () => void
  title?: string
  logoHref?: string
  languageHref?: string
}) {
  const locale = useActiveLocale()
  const path = usePathname()
  const t = useTranslations("navigation.header")
  const titleT = useTranslations("navigation.title")
  const unreadT = useTranslations("home.folders")
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const showApplicationLinks = useShowApplicationLinks()
  const lea = isLeaEnabled()
  const navItems = useAppNavItems()
  const { count: unreadCount, isLoading: unreadLoading } = useInboxUnreadCount()

  const zone = getZoneFromPath(path)
  const zoneRootPath = ZONE_CONFIG[zone].rootPath

  const isApplicationsSurface = path.includes("/my-submissions")
  const headerTitle =
    title ?? (isApplicationsSurface ? titleT("submissions") : titleT(zone))
  const headerLogoHref =
    logoHref ??
    (isApplicationsSurface
      ? `/${locale}/my-submissions`
      : `/${locale}${zoneRootPath}`)
  const logo = useClientHref(headerLogoHref)

  const crossZone = useCrossZoneLink()
  const profileHref = crossZone("profile", `/${locale}/my-profile`)

  const isEnglish = locale === LANG_EN
  const oppositeLocale = isEnglish ? LANG_GA : LANG_EN
  const oppositeLabel = isEnglish ? t("language.irish") : t("language.english")
  const languageHref =
    languageHrefOverride ??
    (path.includes(`/${locale}/`)
      ? path.replace(`/${locale}/`, `/${oppositeLocale}/`)
      : `/${oppositeLocale}`)

  const handleSignOut = () => {
    clearNavSnapshot()
    onSignOut()
  }

  const legacyChrome = title != null
  const showGreeting = !legacyChrome && lea
  const showProfileCta = showGreeting && showApplicationLinks
  const messagesLabel = t("drawer.messages")
  const messagesAriaLabel =
    !unreadLoading && unreadCount > 0
      ? `${messagesLabel}, ${unreadT("unreadBadge", { count: unreadCount })}`
      : messagesLabel

  return (
    <>
      <HeaderNext variant='default'>
        <HeaderLogo>
          <a href={logo.href} aria-label={headerTitle} onClick={logo.onClick}>
            <LogoHarpWhite className='gi-h-10 sm:gi-hidden' />
            <LogoWhite className='gi-hidden sm:gi-block gi-h-14' />
          </a>
        </HeaderLogo>
        {legacyChrome ? <HeaderTitle>{headerTitle}</HeaderTitle> : null}
        <HeaderSecondaryMenu>
          {showGreeting ? (
            <HeaderMenuItemSlot>
              <HeaderGreeting name={publicName} onSignOut={handleSignOut} />
            </HeaderMenuItemSlot>
          ) : null}
          <HeaderMenuItemLink href={languageHref}>
            {oppositeLabel}
          </HeaderMenuItemLink>
        </HeaderSecondaryMenu>
        <HeaderPrimaryMenu>
          {showProfileCta ? (
            <HeaderMenuItemLink
              href={profileHref}
              icon='person'
              showItemMode='desktop-only'
            >
              {t("profile")}
            </HeaderMenuItemLink>
          ) : null}
          <HeaderMenuItemButton
            icon='menu'
            showItemMode={showProfileCta ? "mobile-only" : "always"}
            onClick={(e) => {
              e.currentTarget.blur()
              setIsDrawerOpen(true)
            }}
          >
            {t("menu")}
          </HeaderMenuItemButton>
        </HeaderPrimaryMenu>
      </HeaderNext>
      <DrawerWrapper
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        position='right'
        closeButtonLabel={t("drawer.close")}
        closeButtonSize='large'
      >
        <DrawerBody>
          <UserMenuDrawer
            name={publicName}
            profileHref={profileHref}
            onSignOut={handleSignOut}
            languageHref={languageHref}
            languageLabel={oppositeLabel}
            showProfileLink={showApplicationLinks}
          >
            {showApplicationLinks
              ? navItems.map((item) =>
                  item.id === "messages" ? (
                    <li key={item.id} className={styles.messagesItem}>
                      <DrawerNavItem
                        item={item}
                        ariaLabel={messagesAriaLabel}
                      />
                      <span className={styles.badgeSlot}>
                        <InboxUnreadBadge />
                      </span>
                    </li>
                  ) : (
                    <li key={item.id}>
                      <DrawerNavItem item={item} />
                    </li>
                  ),
                )
              : null}
          </UserMenuDrawer>
        </DrawerBody>
      </DrawerWrapper>
    </>
  )
}

function DrawerNavItem({
  item,
  ariaLabel,
}: {
  item: AppNavItem
  ariaLabel?: string
}) {
  const client = useClientHref(item.href)
  return (
    <ListItem
      href={client.href}
      label={item.label}
      aria-label={ariaLabel}
      bold
      onClick={client.onClick}
    />
  )
}
