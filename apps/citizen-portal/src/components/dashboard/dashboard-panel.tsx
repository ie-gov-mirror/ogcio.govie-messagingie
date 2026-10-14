"use client"

import { Heading } from "@ogcio/design-system-react"
import type { ReactNode } from "react"
import styles from "./dashboard-panel.module.css"

export interface DashboardPanelProps {
  title: string
  /** Bottom-pinned call to action (e.g. "View all …" button). */
  cta?: ReactNode
  children: ReactNode
}

/**
 * Bordered, padded card that holds a dashboard preview list. Shared by the
 * recent-applications and recent-messages columns so both have identical
 * chrome and stretch to equal height in the two-column grid.
 *
 * The panel carries 32px internal padding so the inbox `ListCard` rows sit
 * within the padded space rather than flush to the frame edge; the heading and
 * CTA keep their own inline inset so their text lines up with the rows' text.
 * The title is an h2 under the page h1; `size="md"` keeps the previous h3 scale.
 */
export function DashboardPanel({ title, cta, children }: DashboardPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <Heading as='h2' size='md'>
          {title}
        </Heading>
      </div>
      <div className={styles.body}>{children}</div>
      {cta ? <div className={styles.cta}>{cta}</div> : null}
    </section>
  )
}
