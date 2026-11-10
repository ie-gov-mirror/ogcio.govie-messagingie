"use client"

import {
  Heading,
  Icon,
  type IconProps,
  LinkButton,
  Tag,
  type TagType,
} from "@ogcio/design-system-react"
import { AppLink } from "@/components/navigation/app-link"
import styles from "./le-card.module.css"

type CardSize = "default" | "compact"

type CardHeader = {
  tag?: { text: string; type?: TagType }
  /** Material Symbol name. Decorative. */
  icon?: string
}

type LinkFooter = {
  kind: "link"
  label: string
  /** Message subject. */
  text: string
  href: string
  date: string
  unread?: boolean
  newLabel?: string
}

type TextFooter = {
  kind: "text"
  label: string
  text: string
}

type ButtonFooter = {
  kind: "button"
  supportingText: string
  date: string
  href: string
  buttonLabel: string
}

type CardFooter = LinkFooter | TextFooter | ButtonFooter

type SharedProps = {
  size?: CardSize
  title: string
  titleHref: string
  /** Called when the citizen follows the title link. */
  onTitleClick?: () => void
  className?: string
}

export type LifeEventCardProps = SharedProps & {
  type: "lifeEvent"
  category: string
  /** Material Symbol name. Decorative. Always shown. */
  icon: string
  iconPosition?: "inline" | "above"
}

export type ApplicationCardProps = SharedProps & {
  type: "application"
  /** Organisation. Always shown. */
  meta: string
  metaSecondary?: string
  /**
   * Tag and category icon. Omit the whole header to drop the row.
   * Omit `tag` or `icon` on their own; with no tag the icon sits on the left.
   */
  header?: CardHeader
  footer?: CardFooter
}

export type LeCardProps = LifeEventCardProps | ApplicationCardProps

const shell =
  "gi-relative gi-flex gi-w-full gi-flex-col gi-items-start gi-rounded-sm gi-border gi-border-solid gi-border-color-border-system-neutral-muted gi-bg-white"

export function LeCard(props: LeCardProps) {
  switch (props.type) {
    case "application":
      return <ApplicationCard {...props} />
    case "lifeEvent":
      return <LifeEventCard {...props} />
    default: {
      const _exhaustive: never = props
      return _exhaustive
    }
  }
}

function ApplicationCard({
  size = "default",
  title,
  titleHref,
  onTitleClick,
  meta,
  metaSecondary,
  header,
  footer,
  className,
}: ApplicationCardProps) {
  const compact = size === "compact"
  const showHeader = Boolean(header?.tag || header?.icon)

  return (
    <article
      className={classes(
        styles.card,
        styles.fill,
        shell,
        compact ? "gi-gap-1 gi-p-3" : "gi-gap-2 gi-p-4",
        "gi-min-w-72",
        className,
      )}
    >
      {showHeader && header ? (
        <CardHeaderRow header={header} size={size} />
      ) : null}
      <div
        className={classes(
          "gi-flex gi-w-full gi-min-w-0 gi-flex-1 gi-flex-col",
          compact ? "gi-gap-1" : "gi-gap-2",
        )}
      >
        <CardTitle href={titleHref} onClick={onTitleClick}>
          {title}
        </CardTitle>
        <p className='gi-m-0 gi-w-full gi-truncate gi-text-sm gi-text-color-text-system-neutral-default'>
          {meta}
        </p>
        {metaSecondary ? (
          <p className='gi-m-0 gi-w-full gi-truncate gi-text-sm gi-text-color-text-system-neutral-muted'>
            {metaSecondary}
          </p>
        ) : null}
      </div>
      {footer ? <CardFooterBlock footer={footer} size={size} /> : null}
    </article>
  )
}

function LifeEventCard({
  size = "default",
  title,
  titleHref,
  onTitleClick,
  category,
  icon,
  iconPosition = "inline",
  className,
}: LifeEventCardProps) {
  const compact = size === "compact"

  return (
    <article
      className={classes(
        styles.card,
        shell,
        lifeEventHeight(size, iconPosition),
        compact ? "gi-p-3" : "gi-p-4",
        className,
      )}
    >
      <div className='gi-flex gi-w-full gi-min-w-0 gi-flex-1'>
        <LifeEventHeader
          compact={compact}
          icon={icon}
          iconPosition={iconPosition}
          title={title}
          titleHref={titleHref}
          onTitleClick={onTitleClick}
        />
      </div>
      <p
        className={classes(
          "gi-m-0 gi-w-full gi-truncate gi-text-xs gi-text-color-text-system-neutral-muted",
          compact ? "gi-pt-1" : "gi-pt-2",
        )}
      >
        {category}
      </p>
    </article>
  )
}

function LifeEventHeader({
  compact,
  icon,
  iconPosition,
  title,
  titleHref,
  onTitleClick,
}: {
  compact: boolean
  icon: string
  iconPosition: "inline" | "above"
  title: string
  titleHref: string
  onTitleClick?: () => void
}) {
  const glyph = <CategoryIcon icon={icon} />
  const heading = (
    <CardTitle href={titleHref} onClick={onTitleClick} stretch anywhere>
      {title}
    </CardTitle>
  )

  switch (iconPosition) {
    case "inline":
      return (
        <div
          className={classes(
            "gi-flex gi-w-full gi-min-w-0 gi-items-start",
            compact ? "gi-gap-2" : "gi-gap-4",
          )}
        >
          <div className='gi-min-w-0 gi-flex-1'>{heading}</div>
          {glyph}
        </div>
      )
    case "above":
      return (
        <div className='gi-flex gi-w-full gi-min-w-0 gi-flex-col gi-items-start gi-gap-2'>
          {glyph}
          {heading}
        </div>
      )
    default: {
      const _exhaustive: never = iconPosition
      return _exhaustive
    }
  }
}

function CardHeaderRow({
  header,
  size,
}: {
  header: CardHeader
  size: CardSize
}) {
  return (
    <div className='gi-flex gi-w-full gi-items-start gi-justify-between gi-gap-2'>
      {header.tag ? (
        <Tag
          text={header.tag.text}
          type={header.tag.type}
          size={size === "compact" ? "small" : "default"}
        />
      ) : null}
      {header.icon ? <CategoryIcon icon={header.icon} /> : null}
    </div>
  )
}

function CardTitle({
  href,
  onClick,
  children,
  stretch = false,
  anywhere = false,
}: {
  href: string
  onClick?: () => void
  children: string
  stretch?: boolean
  anywhere?: boolean
}) {
  return (
    <Heading as='h2' size='xs' className='gi-m-0 gi-w-full gi-min-w-0'>
      <AppLink
        href={href}
        onClick={onClick}
        noUnderline
        className={classes(
          styles.titleLink,
          stretch ? styles.stretch : "",
          stretch ? "gi-min-h-11" : "",
          "gi-text-md gi-font-bold gi-text-color-text-tone-convention-default",
        )}
      >
        <span
          className={classes(styles.clamp, anywhere ? styles.anywhere : "")}
        >
          {children}
        </span>
      </AppLink>
    </Heading>
  )
}

function CardFooterBlock({
  footer,
  size,
}: {
  footer: CardFooter
  size: CardSize
}) {
  const compact = size === "compact"

  return (
    <footer
      className={classes(
        "gi-flex gi-w-full gi-flex-col gi-border-t gi-border-solid gi-border-color-border-system-neutral-muted",
        compact ? styles.footerCompact : styles.footerDefault,
        compact ? "gi-pt-2" : "gi-pt-4",
        footerGap(footer.kind),
      )}
    >
      <FooterBody footer={footer} compact={compact} />
    </footer>
  )
}

function FooterBody({
  footer,
  compact,
}: {
  footer: CardFooter
  compact: boolean
}) {
  switch (footer.kind) {
    case "link":
      return (
        <>
          <div className='gi-flex gi-w-full gi-items-start gi-justify-between gi-gap-1'>
            <p className='gi-m-0 gi-min-w-0 gi-flex-1 gi-truncate gi-text-sm gi-text-color-text-system-neutral-muted'>
              {footer.label}
            </p>
            {footer.unread && footer.newLabel ? (
              <p className='gi-m-0 gi-shrink-0 gi-text-sm gi-font-bold gi-text-color-text-system-neutral-default'>
                {footer.newLabel}
              </p>
            ) : null}
          </div>
          <AppLink
            href={footer.href}
            noUnderline
            className={classes(
              styles.oneLine,
              "gi-text-md gi-text-color-text-tone-convention-default",
            )}
          >
            <span className={styles.ellipsis}>{footer.text}</span>
          </AppLink>
          <p className='gi-m-0 gi-w-full gi-truncate gi-text-sm gi-text-color-text-system-neutral-muted'>
            {footer.date}
          </p>
        </>
      )
    case "text":
      return (
        <>
          <p className='gi-m-0 gi-w-full gi-truncate gi-text-sm gi-text-color-text-system-neutral-muted'>
            {footer.label}
          </p>
          <p className='gi-m-0 gi-w-full gi-truncate gi-text-sm gi-text-color-text-system-neutral-default'>
            {footer.text}
          </p>
        </>
      )
    case "button":
      return (
        <>
          <div className='gi-flex gi-w-full gi-min-w-0 gi-items-start gi-gap-1'>
            <p className='gi-m-0 gi-min-w-0 gi-truncate gi-text-sm gi-text-color-text-system-neutral-default'>
              {footer.supportingText}
            </p>
            <p className='gi-m-0 gi-shrink-0 gi-text-sm gi-text-color-text-system-neutral-default'>
              {footer.date}
            </p>
          </div>
          <LinkButton
            href={footer.href}
            variant='secondary'
            size={compact ? "sm" : "md"}
          >
            {footer.buttonLabel}
          </LinkButton>
        </>
      )
    default: {
      const _exhaustive: never = footer
      return _exhaustive
    }
  }
}

function footerGap(kind: CardFooter["kind"]): string {
  switch (kind) {
    case "link":
    case "text":
      return "gi-gap-1"
    case "button":
      return "gi-gap-3"
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function lifeEventHeight(
  size: CardSize,
  iconPosition: "inline" | "above",
): string {
  switch (iconPosition) {
    case "inline":
      return size === "compact"
        ? styles.lifeInlineCompact
        : styles.lifeInlineDefault
    case "above":
      return size === "compact"
        ? styles.lifeAboveCompact
        : styles.lifeAboveDefault
    default: {
      const _exhaustive: never = iconPosition
      return _exhaustive
    }
  }
}

function CategoryIcon({ icon }: { icon: string }) {
  return (
    <span
      className={classes(
        styles.iconFrame,
        "gi-flex gi-h-6 gi-w-6 gi-shrink-0 gi-items-center gi-justify-center",
      )}
      data-testid='le-card-icon'
      aria-hidden='true'
    >
      <Icon
        icon={icon as IconProps["icon"]}
        ariaHidden
        className={styles.glyph}
        style={{ fontSize: "var(--gieds-space-5)" }}
      />
    </span>
  )
}

function classes(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
