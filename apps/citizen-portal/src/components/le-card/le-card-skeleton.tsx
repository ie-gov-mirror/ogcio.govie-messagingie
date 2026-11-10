import styles from "./le-card-skeleton.module.css"

type CardSize = "default" | "compact"

const shell =
  "gi-flex gi-w-full gi-flex-col gi-items-start gi-rounded-sm gi-border gi-border-solid gi-border-color-border-system-neutral-muted gi-bg-white"

/**
 * Loading ghost for an application card. Same footprint as the card so the
 * recent-applications row does not shift when submissions arrive.
 */
export function LeCardSkeleton({ size = "default" }: { size?: CardSize }) {
  const compact = size === "compact"

  return (
    <div
      aria-hidden='true'
      data-testid='le-card-skeleton'
      className={[
        shell,
        styles.card,
        compact ? styles.compact : "",
        compact ? "gi-gap-2 gi-p-3" : "gi-gap-4 gi-p-4",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`${styles.pulse} gi-flex gi-w-full gi-min-w-0 gi-flex-1 gi-flex-col ${compact ? "gi-gap-1" : "gi-gap-2"}`}
      >
        <div className='gi-flex gi-w-full gi-items-start gi-justify-between'>
          <Bar width={compact ? 80 : 90} height={compact ? 21 : 24} />
          <Bar width={20} height={20} />
        </div>
        <Bar width={compact ? 221 : 215} height={16} />
        <Bar width={compact ? 162 : 157} height={14} />
        <div className='gi-flex gi-gap-1'>
          <Bar width={compact ? 132 : 129} height={14} />
          <Bar width={compact ? 103 : 100} height={14} />
        </div>
      </div>
      <div
        className={[
          styles.pulse,
          "gi-flex gi-w-full gi-flex-col gi-gap-1 gi-border-t gi-border-solid gi-border-color-border-system-neutral-muted",
          compact ? styles.footerCompact : "",
          compact ? "gi-pt-2" : "gi-pt-4",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Bar width={compact ? 132 : 129} height={14} />
        <Bar width={compact ? 235 : 229} height={16} />
        <Bar width={compact ? 103 : 100} height={14} />
      </div>
    </div>
  )
}

function Bar({ width, height }: { width: number; height: number }) {
  return <span className={styles.bar} style={{ width, height }} />
}
