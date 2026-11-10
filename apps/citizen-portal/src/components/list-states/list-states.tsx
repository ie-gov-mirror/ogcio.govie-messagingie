"use client"

import { Heading, Link, Paragraph } from "@ogcio/design-system-react"
import NextLink from "next/link"
import styles from "./list-states.module.css"

/** Search and filter params dropped by "Clear search"; folder and page size stay. */
const CLEARED_PARAMS = ["search", "status", "page"]

export function clearSearchHref(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams(searchParams)
  for (const key of CLEARED_PARAMS) params.delete(key)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * A search or filter returned nothing. Plain text rather than an Alert so it
 * doesn't read like an empty list.
 */
export function ListNoResults({
  title,
  description,
  clearLabel,
  clearHref,
}: {
  title: string
  description: string
  clearLabel: string
  clearHref: string
}) {
  return (
    <div className={styles.noResults}>
      <Heading as='h2' size='md'>
        {title}
      </Heading>
      <Paragraph className={styles.noResultsText}>{description}</Paragraph>
      <Link asChild href={clearHref}>
        <NextLink href={clearHref} scroll={false} prefetch={false}>
          {clearLabel}
        </NextLink>
      </Link>
    </div>
  )
}

export function SkeletonBar({ width }: { width: string }) {
  return <span className={styles.bar} style={{ width }} />
}

export function SkeletonCheckbox() {
  return <span className={`${styles.bar} ${styles.checkbox}`} />
}

/** Mobile/tablet card placeholder, the same height as a list card. */
export function SkeletonCard({
  withCheckbox = false,
  testId,
  className,
}: {
  withCheckbox?: boolean
  testId?: string
  className?: string
}) {
  return (
    <div
      className={className ? `${styles.card} ${className}` : styles.card}
      data-testid={testId}
      aria-hidden
    >
      {withCheckbox ? <SkeletonCheckbox /> : null}
      <div className={styles.cardContent}>
        <div className={styles.cardTop}>
          <SkeletonBar width='9.375rem' />
          <SkeletonBar width='5rem' />
        </div>
        <SkeletonBar width='16.25rem' />
        <SkeletonBar width='10rem' />
      </div>
    </div>
  )
}

/** Row keys for a loading list. */
export const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i)
