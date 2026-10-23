import type { Metadata } from "next"
import { ServiceView } from "@/components/discovery/discovery-views"
import { getDiscovery, getLifeEvent, getService } from "@/lib/discovery"

type Params = { locale: string; lifeEvent: string; service: string }
type Props = { params: Promise<Params> }

export const dynamicParams = false

// Bottom-up: `[lifeEvent]` params come from a sibling page, not a layout, so
// they are not passed down here.
export function generateStaticParams({
  params,
}: {
  params: Pick<Params, "locale">
}) {
  return getDiscovery(params.locale).lifeEvents.flatMap((lifeEvent) =>
    lifeEvent.services.flatMap((service) =>
      service.detail
        ? [{ lifeEvent: lifeEvent.slug, service: service.detail.slug }]
        : [],
    ),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, lifeEvent, service } = await params
  const { detail } = getService(
    getLifeEvent(getDiscovery(locale), lifeEvent),
    service,
  )
  return { title: detail.title }
}

export default async function ServicePage({ params }: Props) {
  const { locale, lifeEvent: lifeEventSlug, service: slug } = await params
  const lifeEvent = getLifeEvent(getDiscovery(locale), lifeEventSlug)
  return (
    <ServiceView
      lifeEvent={{ slug: lifeEvent.slug, title: lifeEvent.title }}
      service={getService(lifeEvent, slug).detail}
    />
  )
}
