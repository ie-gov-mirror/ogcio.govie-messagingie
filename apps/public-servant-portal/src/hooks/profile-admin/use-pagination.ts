"use client"

import { useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { PAGINATION_LIMIT_DEFAULT } from "@/const"

export function buildPaging(
  totalCount: number,
  page: number,
  size: number,
): { totalPages: number; currentPage: number } {
  const safeSize = size > 0 ? size : PAGINATION_LIMIT_DEFAULT
  const totalPages = Math.max(1, Math.ceil(totalCount / safeSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  return { totalPages, currentPage }
}

export function usePaginationParams(prefix = ""): {
  page: number
  size: number
  offset: number
} {
  const searchParams = useSearchParams()
  return useMemo(() => {
    const rawPage = Number(searchParams.get(prefix ? `${prefix}Page` : "page"))
    const rawSize = Number(searchParams.get(prefix ? `${prefix}Size` : "size"))
    const page = Number.isNaN(rawPage) || rawPage < 0 ? 1 : rawPage + 1
    const size =
      Number.isNaN(rawSize) || rawSize <= 0 ? PAGINATION_LIMIT_DEFAULT : rawSize
    return {
      page,
      size,
      offset: (page - 1) * size,
    }
  }, [prefix, searchParams])
}
