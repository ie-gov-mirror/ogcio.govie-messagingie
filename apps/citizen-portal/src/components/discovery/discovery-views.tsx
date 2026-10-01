"use client"

import { Heading, Icon, Paragraph, Stack } from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { AppLink } from "@/components/navigation/app-link"
import type { Discovery, Journey, LifeEvent } from "@/lib/discovery-content"
import { ContentBlocks } from "./content-blocks"

/**
 * LEA discovery section (AB#43539): the three page types from the
 * school-place prototype, rendered from the build-time model.
 */

function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <AppLink href={href} iconStart='arrow_back' noVisited>
      {children}
    </AppLink>
  )
}

export function LifeEventsIndexView({ discovery }: { discovery: Discovery }) {
  const t = useTranslations("discovery")
  const locale = useLocale()
  const titles = new Map(discovery.lifeEvents.map((le) => [le.slug, le.title]))

  return (
    <Stack direction='column' gap={6}>
      <Heading as='h1'>{discovery.title}</Heading>
      <ContentBlocks blocks={discovery.intro} />
      <Paragraph size='sm'>
        {t("summary", {
          categories: discovery.categories.length,
          lifeEvents: discovery.lifeEvents.length,
        })}
      </Paragraph>
      {discovery.categories.map((category) => (
        <section
          key={category.key}
          aria-labelledby={`category-${category.key}`}
        >
          <Stack direction='row' gap={2} itemsAlignment='center'>
            <Icon icon={category.icon as ComponentProps<typeof Icon>["icon"]} />
            <Heading as='h2' id={`category-${category.key}`}>
              {category.title}
            </Heading>
          </Stack>
          <ul className='gi-list-none gi-p-0'>
            {category.lifeEvents.map((slug) => (
              <li key={slug} className='gi-py-2'>
                <AppLink href={`/${locale}/discovery/${slug}`}>
                  {titles.get(slug)}
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Stack>
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

  return (
    <Stack direction='column' gap={6}>
      <BackLink href={`/${locale}/discovery`}>{t("backToLifeEvents")}</BackLink>
      <Paragraph size='sm'>
        {t("lifeEventLabel", { category: categoryTitle })}
      </Paragraph>
      <Heading as='h1'>{lifeEvent.title}</Heading>
      <ContentBlocks blocks={lifeEvent.body} />
      <section aria-labelledby='services'>
        <Heading as='h2' id='services'>
          {t("services")}
        </Heading>
        <Paragraph size='sm'>
          {t("servicesCount", { count: lifeEvent.journeys.length })}
        </Paragraph>
        <ul className='gi-list-none gi-p-0'>
          {lifeEvent.journeys.map((journey) => (
            <li key={journey.slug} className='gi-py-3'>
              <AppLink
                href={`/${locale}/discovery/${lifeEvent.slug}/${journey.slug}`}
              >
                {journey.title}
              </AppLink>
              {journey.summary ? (
                <Paragraph size='sm'>{journey.summary}</Paragraph>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </Stack>
  )
}

export function JourneyView({
  lifeEvent,
  journey,
}: {
  lifeEvent: Pick<LifeEvent, "slug" | "title">
  journey: Journey
}) {
  const t = useTranslations("discovery")
  const locale = useLocale()

  return (
    <Stack direction='column' gap={6}>
      <BackLink href={`/${locale}/discovery/${lifeEvent.slug}`}>
        {t("backTo", { title: lifeEvent.title })}
      </BackLink>
      <Heading as='h1'>{journey.title}</Heading>
      <ContentBlocks blocks={journey.body} />
    </Stack>
  )
}
