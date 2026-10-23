"use client"

import { Heading, Icon, Paragraph, Stack } from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"
import type { ComponentProps, ReactNode } from "react"
import { hasMaterialSymbol } from "@/components/load-material-symbols"
import { AppLink } from "@/components/navigation/app-link"
import pageTitleStyles from "@/components/page-title.module.css"
import type {
  ContentLink,
  DiscoveryContent,
  LifeEvent,
  ServiceDetail,
} from "@/lib/discovery"
import { ContentBlocks, contentHref, opensInNewTab } from "./content-blocks"
import styles from "./discovery-views.module.css"

/**
 * LEA discovery section (AB#43539): the life events overview and a page
 * per life event, rendered from the build-time model.
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
  children,
}: {
  title: string
  eyebrow?: string
  children?: ReactNode
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
      {children}
    </Stack>
  )
}

function DiscoveryCard({
  href,
  title,
  description,
  external = false,
}: {
  href: string
  title: ReactNode
  description?: string
  external?: boolean
}) {
  const link = (
    <AppLink className='gi-font-bold' external={external} href={href} size='md'>
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

  return (
    <PageColumn>
      <Stack direction='column' gap={2}>
        <Heading as='h1' className={pageTitleStyles.pageTitle}>
          {discovery.title}
        </Heading>
        <ContentBlocks blocks={discovery.body} />
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
                  icon={
                    (hasMaterialSymbol(category.icon)
                      ? category.icon
                      : "info") as ComponentProps<typeof Icon>["icon"]
                  }
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
  const cardLink = (link: ContentLink) => ({
    href: contentHref(link, locale),
    title: link.text,
    external: opensInNewTab(link),
  })

  return (
    <PageColumn>
      <BackLink href={`/${locale}/discovery`} />
      <PageIntro
        eyebrow={t("lifeEventLabel", { category: categoryTitle })}
        title={lifeEvent.title}
      >
        <ContentBlocks blocks={lifeEvent.body} />
      </PageIntro>
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
              {t("servicesCount", { count: lifeEvent.services.length })}
            </Paragraph>
          </Stack>
          {lifeEvent.services.length > 0 ? (
            <ul className={discoveryListClass}>
              {lifeEvent.services.map((service, i) => (
                <DiscoveryCard
                  key={i}
                  description={service.description}
                  {...cardLink(service.link)}
                />
              ))}
            </ul>
          ) : null}
        </Stack>
      </section>
      {lifeEvent.guidance.length > 0 ? (
        <section aria-labelledby='guidance' className='gi-w-full'>
          <Stack direction='column' gap={{ base: 6, md: 8 }}>
            <Heading as='h2' id='guidance' size='sm'>
              {t("guidance")}
            </Heading>
            <ul className={discoveryListClass}>
              {lifeEvent.guidance.map((link, i) => (
                <DiscoveryCard key={i} {...cardLink(link)} />
              ))}
            </ul>
          </Stack>
        </section>
      ) : null}
    </PageColumn>
  )
}

export function ServiceView({
  lifeEvent,
  service,
}: {
  lifeEvent: Pick<LifeEvent, "slug" | "title">
  service: ServiceDetail
}) {
  const locale = useLocale()
  return (
    <PageColumn>
      <BackLink href={`/${locale}/discovery/${lifeEvent.slug}`} />
      <PageIntro eyebrow={lifeEvent.title} title={service.title}>
        <ContentBlocks blocks={service.body} />
      </PageIntro>
    </PageColumn>
  )
}
