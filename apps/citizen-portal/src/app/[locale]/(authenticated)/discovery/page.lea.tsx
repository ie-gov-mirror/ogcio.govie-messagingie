import type { Metadata } from "next"
import { LifeEventsIndexView } from "@/components/discovery/discovery-views"
import { getDiscovery } from "@/lib/discovery-content"

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return { title: getDiscovery(locale).title }
}

export default async function DiscoveryPage({ params }: Props) {
  const { locale } = await params
  return <LifeEventsIndexView discovery={getDiscovery(locale)} />
}
