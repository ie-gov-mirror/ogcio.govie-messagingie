import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ServiceView } from "@/components/discovery/discovery-views"
import {
  getDiscovery,
  getLifeEvent,
  getService,
  getServicePageParams,
  isServicePagePlaceholder,
} from "@/lib/discovery"

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
  return getServicePageParams(getDiscovery(params.locale))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params
  if (isServicePagePlaceholder(resolved)) return {}
  const { locale, lifeEvent, service } = resolved
  const { detail } = getService(
    getLifeEvent(getDiscovery(locale), lifeEvent),
    service,
  )
  return { title: detail.title }
}

export default async function ServicePage({ params }: Props) {
  const resolved = await params
  if (isServicePagePlaceholder(resolved)) notFound()
  const { locale, lifeEvent: lifeEventSlug, service: slug } = resolved
  const lifeEvent = getLifeEvent(getDiscovery(locale), lifeEventSlug)
  return (
    <ServiceView
      lifeEvent={{ slug: lifeEvent.slug, title: lifeEvent.title }}
      service={getService(lifeEvent, slug).detail}
    />
  )
}
