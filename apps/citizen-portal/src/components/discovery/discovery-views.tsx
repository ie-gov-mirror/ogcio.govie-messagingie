"use client"

import { Heading, Icon, Paragraph, Stack } from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"
import type { ComponentProps, ReactNode } from "react"
import { AppLink } from "@/components/navigation/app-link"
import pageTitleStyles from "@/components/page-title.module.css"
import type {
  ContentBlock,
  DiscoveryContent,
  Journey,
  LifeEvent,
  RichTextNode,
} from "@/lib/discovery"
import { ContentBlocks, LeadParagraph } from "./content-blocks"
import styles from "./discovery-views.module.css"

/**
 * LEA discovery section (AB#43539): the three page types from the
 * school-place prototype, rendered from the build-time model.
 */

const discoveryListClass =
  "gi-m-0 gi-flex gi-w-full gi-list-none gi-flex-col gi-gap-2 gi-p-0"
const discoveryItemClass =
  "gi-border-b gi-border-color-border-system-neutral-muted gi-pb-4"

function BackLink({ href }: { href: string }) {
  const t = useTranslations("home.button")
  return (
    <AppLink href={href} iconStart='arrow_back' noColor noUnderline>
      {t("back")}
    </AppLink>
  )
}

function PageColumn({ children }: { children: ReactNode }) {
  return (
    <Stack
      className={styles.measure}
      direction='column'
      gap={{ base: 6, md: 8 }}
    >
      {children}
    </Stack>
  )
}

function PageIntro({
  title,
  eyebrow,
  lead,
}: {
  title: string
  eyebrow?: string
  lead: RichTextNode[] | null
}) {
  return (
    <Stack direction='column' gap={2}>
      {eyebrow ? (
        <Paragraph
          className='gi-font-bold gi-text-color-text-system-neutral-muted'
          size='sm'
        >
          {eyebrow}
        </Paragraph>
      ) : null}
      <Heading as='h1' className={pageTitleStyles.pageTitle}>
        {title}
      </Heading>
      {lead ? <LeadParagraph nodes={lead} /> : null}
    </Stack>
  )
}

/** Pull the page's first paragraph out so it can sit in the intro stack. */
function splitLead(blocks: ContentBlock[]): {
  lead: RichTextNode[] | null
  rest: ContentBlock[]
} {
  const [first, ...tail] = blocks
  if (first?.type !== "richText") return { lead: null, rest: blocks }
  const [head, ...nodes] = first.nodes
  if (head?.type !== "paragraph") return { lead: null, rest: blocks }
  const rest =
    nodes.length > 0 ? [{ type: "richText" as const, nodes }, ...tail] : tail
  return { lead: head.children, rest }
}

function plainText(nodes: readonly RichTextNode[]): string {
  let text = ""
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        text += node.value
        break
      case "lineBreak":
        text += " "
        break
      case "paragraph":
      case "listItem":
      case "strong":
      case "emphasis":
      case "link":
      case "list":
        text += plainText(node.children)
        break
      default: {
        const _exhaustive: never = node
        return _exhaustive
      }
    }
  }
  return text
}

/** CMS summary when the life event has one; otherwise its intro paragraph. */
function overviewDescription(lifeEvent: LifeEvent): string | undefined {
  const summary = lifeEvent.summary?.trim()
  if (summary) return summary
  for (const block of lifeEvent.body) {
    if (block.type !== "richText") continue
    for (const node of block.nodes) {
      if (node.type !== "paragraph") continue
      const text = plainText(node.children).trim()
      if (text) return text
    }
  }
  return undefined
}

function DiscoveryCard({
  href,
  title,
  description,
}: {
  href: string
  title: ReactNode
  description?: string
}) {
  const link = (
    <AppLink className='gi-font-bold' href={href} size='md'>
      {title}
    </AppLink>
  )
  return (
    <li className={discoveryItemClass}>
      {description ? (
        <Stack direction='column' gap={2}>
          {link}
          <Paragraph size='sm'>{description}</Paragraph>
        </Stack>
      ) : (
        link
      )}
    </li>
  )
}

export function LifeEventsIndexView({
  discovery,
}: {
  discovery: DiscoveryContent
}) {
  const t = useTranslations("discovery")
  const locale = useLocale()
  const lifeEvents = new Map(discovery.lifeEvents.map((le) => [le.slug, le]))
  const { lead, rest } = splitLead(discovery.body)

  return (
    <PageColumn>
      <Stack direction='column' gap={2}>
        <Heading as='h1' className={pageTitleStyles.pageTitle}>
          {discovery.title}
        </Heading>
        {lead ? <LeadParagraph nodes={lead} /> : null}
        <Paragraph
          className='gi-text-color-text-system-neutral-muted'
          size='md'
        >
          {t("summary", {
            categories: discovery.categories.length,
            lifeEvents: discovery.lifeEvents.length,
          })}
        </Paragraph>
      </Stack>
      {rest.length > 0 ? <ContentBlocks blocks={rest} /> : null}
      <Stack direction='column' gap={{ base: 6, md: 8 }}>
        {discovery.categories.map((category) => (
          <section
            key={category.key}
            aria-labelledby={`category-${category.key}`}
            className='gi-w-full'
          >
            <Stack direction='column' gap={4}>
              <Stack direction='row' gap={2} itemsAlignment='center'>
                <Icon
                  className={styles.categoryIcon}
                  icon={category.icon as ComponentProps<typeof Icon>["icon"]}
                />
                <Heading as='h2' id={`category-${category.key}`} size='sm'>
                  {category.title}
                </Heading>
              </Stack>
              <ul className={discoveryListClass}>
                {category.lifeEventSlugs.map((slug) => {
                  const lifeEvent = lifeEvents.get(slug)
                  return (
                    <DiscoveryCard
                      key={slug}
                      description={
                        lifeEvent ? overviewDescription(lifeEvent) : undefined
                      }
                      href={`/${locale}/discovery/${slug}`}
                      title={lifeEvent?.title}
                    />
                  )
                })}
              </ul>
            </Stack>
          </section>
        ))}
      </Stack>
    </PageColumn>
  )
}

export function LifeEventView({
  lifeEvent,
  categoryTitle,
}: {
  lifeEvent: LifeEvent
  categoryTitle: string
}) {
  const t = useTranslations("discovery")
  const locale = useLocale()
  const { lead, rest } = splitLead(lifeEvent.body)

  return (
    <PageColumn>
      <BackLink href={`/${locale}/discovery`} />
      <PageIntro
        eyebrow={t("lifeEventLabel", { category: categoryTitle })}
        lead={lead}
        title={lifeEvent.title}
      />
      {rest.length > 0 ? <ContentBlocks blocks={rest} /> : null}
      <section aria-labelledby='services' className='gi-w-full'>
        <Stack direction='column' gap={{ base: 6, md: 8 }}>
          <Stack direction='column' gap={2}>
            <Heading as='h2' id='services' size='sm'>
              {t("services")}
            </Heading>
            <Paragraph
              className='gi-text-color-text-system-neutral-muted'
              size='md'
            >
              {t("servicesCount", { count: lifeEvent.journeys.length })}
            </Paragraph>
          </Stack>
          {lifeEvent.journeys.length > 0 ? (
            <ul className={discoveryListClass}>
              {lifeEvent.journeys.map((journey) => (
                <DiscoveryCard
                  key={journey.slug}
                  description={journey.summary}
                  href={`/${locale}/discovery/${lifeEvent.slug}/${journey.slug}`}
                  title={journey.title}
                />
              ))}
            </ul>
          ) : null}
        </Stack>
      </section>
    </PageColumn>
  )
}

export function JourneyView({
  lifeEvent,
  journey,
}: {
  lifeEvent: Pick<LifeEvent, "slug">
  journey: Journey
}) {
  const locale = useLocale()
  const { lead, rest } = splitLead(journey.body)

  return (
    <PageColumn>
      <BackLink href={`/${locale}/discovery/${lifeEvent.slug}`} />
      <PageIntro lead={lead} title={journey.title} />
      {rest.length > 0 ? <ContentBlocks blocks={rest} /> : null}
    </PageColumn>
  )
}
