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
import type { ApiServiceUserImport, PaginationMetadata } from "@/types"
import { formatDate, formatTime } from "@/util/profile-admin/date"
import { url as buildUrl } from "@/util/profile-admin/url"
import { PaginationWrapper } from "./pagination-wrapper"
import { SearchForm } from "./search-form"
import { StatusTag } from "./status-tag"

export function ServiceUsersImportsTable() {
  const t = useTranslations("serviceUsers.imports")
  const locale = useLocale()
  const url = buildUrl(locale)
  const searchParams = useSearchParams()
  const search = searchParams.get("imports") ?? ""
  const { page, size, offset } = usePaginationParams("imports")

  const query = new URLSearchParams()
  query.set("offset", String(offset))
  query.set("limit", String(size))
  if (search) query.set("search", search)

  const { data, metadata, error, isLoading } = useGatewayFetch<
    ApiServiceUserImport[],
    PaginationMetadata
  >(`/profile/api/v1/profiles/imports/?${query.toString()}`)

  const imports = data ?? []
  const paging = buildPaging(metadata?.totalCount ?? 0, page, size)

  const columns = useMemo<ColumnDef<ApiServiceUserImport>[]>(
    () => [
      {
        id: "fileName",
        header: t("table.columns.fileName"),
        meta: { size: "lg-flex" },
        accessorFn: (row) => row.metadata?.filename,
      },
      {
        id: "importedAt",
        header: t("table.columns.importedAt"),
        meta: { size: "md-fixed" },
        accessorFn: (row) =>
          `${formatDate(row.createdAt)} ${formatTime(row.createdAt)}`,
      },
      {
        id: "status",
        header: t("table.columns.status"),
        meta: { size: "sm-fixed" },
        cell: ({ row }) => <StatusTag status={row.original.status} />,
      },
      {
        id: "actions",
        header: t("table.columns.actions"),
        meta: { size: "xs-fixed" },
        cell: ({ row }) => (
          <Link href={url.serviceUsers.imports(row.original.id)}>
            {t("table.actions.view")}
          </Link>
        ),
      },
    ],
    [t, url],
  )

  const table = useReactTable({
    data: imports,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Stack direction='column' gap={10}>
      <Stack direction='column' gap={10}>
        <SearchForm searchKey='imports' pageKey='importsPage' />
        <div className='table-scroll-wrapper'>
          <TanStackTable
            table={table}
            isLoading={isLoading}
            errorMessage={error ? (error?.message ?? String(error)) : undefined}
            emptyMessage={t("table.noResults")}
            aria-label={t("table.columns.fileName")}
          />
        </div>
      </Stack>
      {paging.totalPages > 1 && (
        <PaginationWrapper
          currentPage={paging.currentPage}
          totalPages={paging.totalPages}
          size={PAGINATION_LIMIT_DEFAULT}
          pageKey='importsPage'
          sizeKey='importsSize'
        />
      )}
    </Stack>
  )
}
