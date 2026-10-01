"use client"

import { Pagination } from "@ogcio/design-system-react"
import { useRouter, useSearchParams } from "next/navigation"

export function PaginationWrapper({
  currentPage,
  totalPages,
  size,
  pageKey = "page",
  sizeKey = "size",
}: {
  currentPage: number
  totalPages: number
  size: number
  pageKey?: string
  sizeKey?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resolvedCurrent =
    Number(searchParams.get(pageKey)) + 1 || currentPage || 1

  const handlePageChange = (page: number) => {
    const sp = new URLSearchParams(searchParams)
    sp.set(pageKey, (page - 1).toString())
    sp.set(sizeKey, size.toString())
    router.push(`?${sp.toString()}`)
  }

  return (
    <Pagination
      currentPage={resolvedCurrent}
      totalPages={totalPages}
      onPageChange={handlePageChange}
    />
  )
}
