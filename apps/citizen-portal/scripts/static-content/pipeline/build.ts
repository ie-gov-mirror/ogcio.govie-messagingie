import {
  type DiscoveryContent,
  type DiscoveryLocale,
  discoveryContentSchema,
} from "../../../src/lib/discovery/index.ts"
import { createWagtailClient, type Transport } from "../wagtail/index.ts"
import { allPages, discoverTree, findTranslations } from "./discover.ts"
import { IssueCollector } from "./issues.ts"
import { buildLinkTargets } from "./links.ts"
import { mapContent } from "./map.ts"
import { checkStructure } from "./structure.ts"
import { validateTree } from "./validate.ts"

export type BuildResult = {
  content?: Record<DiscoveryLocale, DiscoveryContent>
  issues: IssueCollector
}

export async function buildDiscoveryContent(options: {
  transport: Transport
  indexPageId: number
}): Promise<BuildResult> {
  const client = createWagtailClient(options.transport)
  const issues = new IssueCollector()

  const raw = await discoverTree(client, options.indexPageId)
  const translations = await findTranslations(client, allPages(raw), issues)
  const tree = validateTree(raw, translations, issues)
  if (!tree) return { issues }

  checkStructure(tree, issues)
  if (issues.hasErrors) return { issues }

  const content = mapContent(tree, buildLinkTargets(tree), issues)
  if (issues.hasErrors) return { issues }

  // A failure here is a bug in the mapping, not a content error.
  for (const locale of Object.keys(content) as DiscoveryLocale[]) {
    discoveryContentSchema.parse(content[locale])
  }
  return { content, issues }
}
