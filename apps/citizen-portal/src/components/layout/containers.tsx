import { Container, Stack } from "@ogcio/design-system-react"
import type { ReactNode } from "react"

/**
 * Layout containers shared across all zones.
 *
 * Unified from the messages and profile zones in Phase B2 (per the
 * single-component / no-duplication rule). The previous CSS-module
 * MainContainer (zones/messages) gave way to the inline-style version
 * (zones/profile) — same effective layout, one fewer asset to ship.
 */

export function MainContainer({ children }: { children: ReactNode }) {
  return (
    <main
      className='gi-flex-1'
      style={{
        marginBottom: "var(--gieds-space-16)",
        marginTop: "var(--gieds-space-10)",
      }}
    >
      {children}
    </main>
  )
}

export function TwoColumnLayout({ children }: { children: ReactNode }) {
  return (
    <article className='twelve-column-layout two-columns'>{children}</article>
  )
}

export function FullWidthContainer({ children }: { children: ReactNode }) {
  return <div style={{ width: "100%" }}>{children}</div>
}

/** Main content area aligned with HeaderNext / PageHeader container width. */
export function AppMainContent({
  children,
  aside,
}: {
  children: ReactNode
  /** Desktop side nav. The aside hides itself below 640px. */
  aside?: ReactNode
}) {
  return (
    <MainContainer>
      <Container>
        {aside ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "2rem",
            }}
          >
            {aside}
            <FullWidthContainer>{children}</FullWidthContainer>
          </div>
        ) : (
          <Stack direction='row' wrap gap={10}>
            <FullWidthContainer>{children}</FullWidthContainer>
          </Stack>
        )}
      </Container>
    </MainContainer>
  )
}
