"use client"

import { Heading, Icon, ListItem } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import type { PropsWithChildren, ReactNode } from "react"

/**
 * Drawer that opens off the page header. Follows the DS drawer menu
 * pattern (AB#41657): every entry is a bold `ListItem` (divider, padding,
 * no purple `:visited`). Profile leads the nav list; language and logout
 * sit in a separate group pinned to the bottom of the drawer (AB#43820).
 *
 * Children are expected to be `<li>` wrappers around further
 * `ListItem`s (see `page-header.tsx`).
 */
export function UserMenuDrawer({
  name,
  profileHref,
  onSignOut,
  languageHref,
  languageLabel,
  showProfileLink = true,
  children,
}: PropsWithChildren<{
  /** Usually `<PublicName>`; a plain string for pre-profile surfaces. */
  name: ReactNode
  profileHref: string
  onSignOut: () => void
  languageHref: string
  languageLabel: string
  showProfileLink?: boolean
}>) {
  const t = useTranslations("navigation.userMenu")

  return (
    <div className='user-drawer-menu-container'>
      <Heading as='h2' size='lg'>
        {name}
      </Heading>
      <ul className='gi-mt-4'>
        {showProfileLink ? (
          <li>
            <ListItem href={profileHref} label={t("viewMyProfile")} bold />
          </li>
        ) : null}
        {children}
      </ul>

      <ul className='footer'>
        <li>
          <ListItem href={languageHref} label={languageLabel} bold />
        </li>
        <li>
          <button
            type='button'
            onClick={onSignOut}
            className='gi-list-item gi-font-bold user-drawer-logout'
          >
            <Icon icon='logout' aria-hidden='true' />
            <span className='gi-text-sm'>{t("logout")}</span>
          </button>
        </li>
      </ul>
    </div>
  )
}
