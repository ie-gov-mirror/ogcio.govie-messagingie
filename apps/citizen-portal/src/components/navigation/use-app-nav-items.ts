"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import { useTranslations } from "next-intl"
import { useActiveLocale } from "@/hooks/use-active-locale"
import { isLeaEnabled, isZoneEnabled } from "@/lib/feature-config"

export type AppNavItemId =
  | "dashboard"
  | "lifeEvents"
  | "applications"
  | "messages"

export interface AppNavItem {
  id: AppNavItemId
  label: string
  href: string
}

export function useAppNavItems(): AppNavItem[] {
  const locale = useActiveLocale()
  const t = useTranslations("navigation.header.drawer")
  const crossZone = useCrossZoneLink()
  const lea = isLeaEnabled()
  const items: AppNavItem[] = []

  if (isZoneEnabled("dashboard")) {
    items.push({
      id: "dashboard",
      label: t("dashboard"),
      href: crossZone("dashboard", `/${locale}/my-dashboard`),
    })
  }

  if (lea && isZoneEnabled("dashboard")) {
    items.push({
      id: "lifeEvents",
      label: t("lifeEvents"),
      href: crossZone("dashboard", `/${locale}/discovery`),
    })
  }

  if (lea && isZoneEnabled("dashboard")) {
    items.push({
      id: "applications",
      label: t("applications"),
      href: crossZone("dashboard", `/${locale}/my-submissions`),
    })
  }

  if (isZoneEnabled("messages")) {
    items.push({
      id: "messages",
      label: t("messages"),
      href: crossZone("messages", `/${locale}/messages`),
    })
  }

  return items
}

export function activeAppNavId(pathname: string): AppNavItemId | undefined {
  if (pathname.includes("/discovery")) return "lifeEvents"
  if (pathname.includes("/my-submissions")) return "applications"
  if (pathname.includes("/messages") || pathname.includes("/secure-messages")) {
    return "messages"
  }
  if (pathname.includes("/my-dashboard")) return "dashboard"
  return undefined
}
