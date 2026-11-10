import { MyDashboardRoute } from "@/components/dashboard/my-dashboard-route"
import { getDashboardLifeEvents, getDiscovery } from "@/lib/discovery"
import { isLeaEnabled } from "@/lib/feature-config"

type Props = { params: Promise<{ locale: string }> }

// Server component so the LE Card dashboard can read discovery content at
// build time; everything else stays client-side in `MyDashboardRoute`.
export default async function MyDashboardPage({ params }: Props) {
  const { locale } = await params
  const lifeEvents = isLeaEnabled()
    ? getDashboardLifeEvents(getDiscovery(locale))
    : []
  return <MyDashboardRoute lifeEvents={lifeEvents} />
}
