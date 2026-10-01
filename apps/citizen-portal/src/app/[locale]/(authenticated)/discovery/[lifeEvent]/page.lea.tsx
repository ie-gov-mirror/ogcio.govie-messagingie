import type { Metadata } from "next"
import { LifeEventView } from "@/components/discovery/discovery-views"
import { getDiscovery, getLifeEvent } from "@/lib/discovery-content"

type Params = { locale: string; lifeEvent: string }
type Props = { params: Promise<Params> }

export const dynamicParams = false

export function generateStaticParams({
  params,
}: {
  params: Pick<Params, "locale">
}) {
  return getDiscovery(params.locale).lifeEvents.map((le) => ({
    lifeEvent: le.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, lifeEvent } = await params
  return { title: getLifeEvent(getDiscovery(locale), lifeEvent).title }
}

export default async function LifeEventPage({ params }: Props) {
  const { locale, lifeEvent: slug } = await params
  const discovery = getDiscovery(locale)
  const lifeEvent = getLifeEvent(discovery, slug)
  const category = discovery.categories.find(
    (c) => c.key === lifeEvent.categoryKey,
  )

  return (
    <LifeEventView
      lifeEvent={lifeEvent}
      categoryTitle={category?.title ?? ""}
    />
  )
}
