"use client"

import {
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME,
  type OrganizationInfo,
  useAuth,
  useSagClient,
} from "@ogcio/sag-client/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { env } from "@/env/env.client"
import { persistLastSelectedOrganization } from "@/util/last-selected-org"

export type AdminOrganization = OrganizationInfo

interface OrganizationContext {
  organizations: AdminOrganization[]
  currentOrganization: AdminOrganization | undefined
  isLoading: boolean
  setOrganization: (organizationId: string) => Promise<void>
}

export function useOrganizationContext(): OrganizationContext {
  const { claims, user } = useAuth()
  const client = useSagClient()
  const gatewayUrl = client.gatewayUrl ?? env.NEXT_PUBLIC_SAG_URL

  const [organizations, setOrganizations] = useState<AdminOrganization[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const headers = { "X-Application": client.appName }
        const [orgsResp, selectedResp] = await Promise.all([
          fetch(`${gatewayUrl}/auth/organizations`, {
            credentials: "include",
            cache: "no-store",
            headers,
          }),
          fetch(`${gatewayUrl}/auth/selected-organization`, {
            credentials: "include",
            cache: "no-store",
            headers,
          }),
        ])
        if (cancelled) return
        const orgsBody = orgsResp.ok
          ? ((await orgsResp.json()) as { organizations?: AdminOrganization[] })
          : { organizations: [] }
        const selectedBody = selectedResp.ok
          ? ((await selectedResp.json()) as { organizationId?: string | null })
          : { organizationId: null }
        const list = (orgsBody.organizations ?? []).filter((o) =>
          o.roles?.includes(MESSAGING_PUBLIC_SERVANT_ROLE_NAME),
        )
        setOrganizations(list)
        setSelectedId(selectedBody.organizationId ?? claims?.organizations?.[0])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [client.appName, gatewayUrl, claims])

  const currentOrganization = useMemo(
    () => organizations.find((o) => o.id === selectedId) ?? organizations[0],
    [organizations, selectedId],
  )

  const setOrganization = useCallback(
    async (organizationId: string) => {
      if (!organizationId || organizationId === selectedId) return
      const ok = await client.selectOrganization(organizationId)
      if (!ok) return
      // Remember the explicit choice so it is restored after a future
      // logout/login, not just across the imminent hard reload (AB#28623).
      persistLastSelectedOrganization(user?.sub, organizationId)
      window.location.reload()
    },
    [client, selectedId, user],
  )

  return {
    organizations,
    currentOrganization,
    isLoading,
    setOrganization,
  }
}
