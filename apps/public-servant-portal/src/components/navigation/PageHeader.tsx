"use client"
import { Header } from "@ogcio/design-system-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useOrganizationContext } from "@/hooks/use-organization-context"
import { useClientLanguages } from "@/util/get-languages"
import { DrawerLink } from "./DrawerLink"
import UserMenuDrawer from "./UserMenuDrawer"

export const PageHeader = ({
  publicName,
  config,
}: {
  publicName: string
  config: {
    profileAdminUrl: string
    messagingUrl: string
  }
}) => {
  const locale = useLocale()
  const path = usePathname()
  const { currentOrganization } = useOrganizationContext()
  const searchParams = useSearchParams()
  const t = useTranslations("navigation.header")
  const { profileAdminUrl, messagingUrl } = config

  const languages = useClientLanguages({
    path,
    locale,
    search: searchParams.get("search"),
  })

  return (
    <Header
      logo={{
        href: "/",
      }}
      secondaryLinks={[languages]}
      title={`${currentOrganization?.name ? `${currentOrganization.name} - ` : ""} ${t("drawer.link.messaging")} Admin`.trim()}
      items={[
        {
          itemType: "slot",
          icon: "menu",
          label: t("label.menu"),
          showItemMode: "always",
          component: (
            <UserMenuDrawer
              name={publicName}
              selfLabel={t("drawer.link.profile")}
              selfHref={`${profileAdminUrl}/${locale}/my-profile`}
              signoutLabel={t("drawer.link.logout")}
            >
              <DrawerLink isBold href={`${messagingUrl}/${locale}`}>
                {t("drawer.link.messaging")}
              </DrawerLink>

              <DrawerLink
                isBold
                href={[profileAdminUrl, locale, "service-users"].join("/")}
              >
                {t("drawer.link.serviceUsers")}
              </DrawerLink>

              <DrawerLink href={languages.href}>{languages.label}</DrawerLink>
            </UserMenuDrawer>
          ),
          drawerPosition: "right",
          slotAppearance: "drawer",
        },
      ]}
    />
  )
}
