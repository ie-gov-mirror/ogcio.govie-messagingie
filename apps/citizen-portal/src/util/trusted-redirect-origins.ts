import type { ZoneHosts } from "@citizen-portal/shared"
import { env } from "@/env/env.client"

export function getTrustedRedirectOrigins(hosts: ZoneHosts): string[] {
  return [
    env.NEXT_PUBLIC_BASE_URL,
    ...Object.values(hosts),
    env.NEXT_PUBLIC_MESSAGING_ADMIN_URL,
    env.NEXT_PUBLIC_PROFILE_ADMIN_URL,
    env.NEXT_PUBLIC_DASHBOARD_ADMIN_URL,
    env.NEXT_PUBLIC_PAYMENTS_URL,
    env.NEXT_PUBLIC_JOURNEY_URL,
    env.NEXT_PUBLIC_FORMS_URL,
  ]
}
