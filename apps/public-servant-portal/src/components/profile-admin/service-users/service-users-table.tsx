"use client"

import { Link, Stack } from "@ogcio/design-system-react"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { TanStackTable } from "@/components/tables/TanStackTable"
import { PAGINATION_LIMIT_DEFAULT } from "@/const"
import {
  buildPaging,
  usePaginationParams,
} from "@/hooks/profile-admin/use-pagination"
import type { ApiProfileUser, PaginationMetadata } from "@/types"
import { formatDate } from "@/util/profile-admin/date"
import { url as buildUrl } from "@/util/profile-admin/url"
import { PaginationWrapper } from "./pagination-wrapper"
import { SearchForm } from "./search-form"

export function ServiceUsersTable() {
  const t = useTranslations("serviceUsers.profiles")
  const locale = useLocale()
  const url = buildUrl(locale)
  const searchParams = useSearchParams()
  const search = searchParams.get("profiles") ?? ""
  const { page, size, offset } = usePaginationParams("profiles")

  const query = new URLSearchParams()
  query.set("offset", String(offset))
  query.set("limit", String(size))
  if (search) query.set("search", search)

  const { data, metadata, error, isLoading } = useGatewayFetch<
    ApiProfileUser[],
    PaginationMetadata
  >(`/profile/api/v1/profiles/?${query.toString()}`)

  const profiles = data ?? []
  const paging = buildPaging(metadata?.totalCount ?? 0, page, size)

  const columns = useMemo<ColumnDef<ApiProfileUser>[]>(
    () => [
      {
        id: "email",
        header: t("table.columns.email"),
        meta: { size: "lg-flex" },
        accessorKey: "email",
      },
      {
        id: "ppsn",
        header: t("table.columns.ppsn"),
        meta: { size: "xs-fixed" },
        accessorFn: (row) => row.details?.ppsn || "-",
      },
      {
        id: "name",
        header: t("table.columns.name"),
        meta: { size: "md-fixed" },
        accessorFn: (row) =>
          [row.details?.firstName, row.details?.lastName]
            .filter(Boolean)
            .join(" ") || "-",
      },
      {
        id: "publicName",
        header: t("table.columns.publicName"),
        meta: { size: "sm-fixed" },
        accessorKey: "publicName",
      },
      {
        id: "lastLoggedIn",
        header: t("table.columns.lastLoggedIn"),
        meta: { size: "sm-fixed" },
        accessorFn: (row) => (row.updatedAt ? formatDate(row.updatedAt) : "-"),
      },
      {
        id: "actions",
        header: t("table.columns.actions"),
        meta: { size: "xs-fixed" },
        cell: ({ row }) => (
          <Stack direction='row' gap={4}>
            <Link href={url.serviceUsers.one(row.original.id)}>
              {t("table.actions.view")}
            </Link>
            <Link href={url.serviceUsers.edit(row.original.id)}>
              {t("table.actions.edit")}
            </Link>
          </Stack>
        ),
      },
    ],
    [t, url],
  )

  const table = useReactTable({
    data: profiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Stack direction='column' gap={10}>
      <Stack direction='column' gap={10}>
        <SearchForm searchKey='profiles' pageKey='profilesPage' />
        <div className='table-scroll-wrapper'>
          <TanStackTable
            table={table}
            isLoading={isLoading}
            errorMessage={error ? (error?.message ?? String(error)) : undefined}
            emptyMessage={t("table.noResults")}
            aria-label={t("table.columns.email")}
          />
        </div>
      </Stack>
      {paging.totalPages > 1 && (
        <PaginationWrapper
          currentPage={paging.currentPage}
          totalPages={paging.totalPages}
          size={PAGINATION_LIMIT_DEFAULT}
          pageKey='profilesPage'
          sizeKey='profilesSize'
        />
      )}
    </Stack>
  )
}
