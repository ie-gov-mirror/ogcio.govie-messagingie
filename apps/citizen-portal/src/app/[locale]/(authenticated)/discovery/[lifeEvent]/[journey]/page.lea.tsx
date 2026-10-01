import type { Metadata } from "next"
import { JourneyView } from "@/components/discovery/discovery-views"
import { getDiscovery, getLifeEvent } from "@/lib/discovery-content"

type Params = { locale: string; lifeEvent: string; journey: string }
type Props = { params: Promise<Params> }

export const dynamicParams = false

// Bottom-up: `[lifeEvent]` params come from a sibling page, not a layout, so
// they are not passed down here.
export function generateStaticParams({
  params,
}: {
  params: Pick<Params, "locale">
}) {
  return getDiscovery(params.locale).lifeEvents.flatMap((le) =>
    le.journeys.map((j) => ({ lifeEvent: le.slug, journey: j.slug })),
  )
}

function load({ locale, lifeEvent: leSlug, journey: slug }: Params) {
  const lifeEvent = getLifeEvent(getDiscovery(locale), leSlug)
  const journey = lifeEvent.journeys.find((j) => j.slug === slug)
  if (!journey) throw new Error(`Unknown journey "${leSlug}/${slug}"`)
  return { lifeEvent, journey }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: load(await params).journey.title }
}

export default async function JourneyPage({ params }: Props) {
  const { lifeEvent, journey } = load(await params)
  return (
    <JourneyView
      lifeEvent={{ slug: lifeEvent.slug, title: lifeEvent.title }}
      journey={journey}
    />
  )
}
