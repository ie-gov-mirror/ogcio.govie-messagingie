import { z } from "zod"
import { AVAILABLE_LOCALES } from "../../const/locale.ts"

// scripts/static-content runs this file under Node's type stripping: keep
// imports relative with `.ts` extensions (no `@/` alias).

export const DISCOVERY_CONTENT_SCHEMA_VERSION = 2

export const discoveryLocaleSchema = z.enum(AVAILABLE_LOCALES)
export type DiscoveryLocale = z.infer<typeof discoveryLocaleSchema>

// Internal link hrefs are locale-relative app paths (`/discovery/…`) that
// the renderer prefixes with the locale; external ones are absolute https URLs.
export type RichTextNode =
  | { type: "text"; value: string }
  | { type: "lineBreak" }
  | {
      type: "paragraph" | "listItem" | "strong" | "emphasis"
      children: RichTextNode[]
    }
  | { type: "heading"; level: RichTextHeadingLevel; children: RichTextNode[] }
  | { type: "list"; ordered: boolean; children: RichTextNode[] }
  | { type: "link"; href: string; internal: boolean; children: RichTextNode[] }

// `h1` is the page title, so content can't add another.
export const RICH_TEXT_HEADING_LEVELS = [2, 3, 4] as const
export type RichTextHeadingLevel = (typeof RICH_TEXT_HEADING_LEVELS)[number]

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), value: z.string() }),
    z.object({ type: z.literal("lineBreak") }),
    z.object({
      type: z.enum(["paragraph", "listItem", "strong", "emphasis"]),
      children: z.array(richTextNodeSchema),
    }),
    z.object({
      type: z.literal("heading"),
      level: z.literal(RICH_TEXT_HEADING_LEVELS),
      children: z.array(richTextNodeSchema),
    }),
    z.object({
      type: z.literal("list"),
      ordered: z.boolean(),
      children: z.array(richTextNodeSchema),
    }),
    z.object({
      type: z.literal("link"),
      href: z.string().min(1),
      internal: z.boolean(),
      children: z.array(richTextNodeSchema),
    }),
  ]),
)

export const contentLinkSchema = z.object({
  text: z.string().min(1),
  href: z.string().min(1),
  internal: z.boolean(),
})
export type ContentLink = z.infer<typeof contentLinkSchema>

export const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1) }),
  z.object({ type: z.literal("richText"), nodes: z.array(richTextNodeSchema) }),
  z.object({
    type: z.literal("buttonLinks"),
    links: z.array(contentLinkSchema).min(1),
  }),
])
export type ContentBlock = z.infer<typeof contentBlockSchema>

export const serviceDetailSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  body: z.array(contentBlockSchema),
})
export type ServiceDetail = z.infer<typeof serviceDetailSchema>

export const serviceSchema = z.object({
  link: contentLinkSchema,
  description: z.string().min(1).optional(),
  // Present when the service's CMS link is a page with a body. The card
  // then opens that page at /discovery/<life-event>/<slug>.
  detail: serviceDetailSchema.optional(),
})
export type Service = z.infer<typeof serviceSchema>

export const lifeEventSchema = z.object({
  // The EN page's ID and slug, shared by both locales.
  id: z.number().int(),
  slug: z.string().min(1),
  title: z.string().min(1),
  body: z.array(contentBlockSchema),
  highlighted: z.boolean(),
  services: z.array(serviceSchema),
  guidance: z.array(contentLinkSchema),
})
export type LifeEvent = z.infer<typeof lifeEventSchema>

export const categorySchema = z.object({
  // The CMS block ID, which the GA landing page shares with EN.
  key: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().min(1),
  lifeEventSlugs: z.array(z.string().min(1)),
})
export type Category = z.infer<typeof categorySchema>

export const discoveryContentSchema = z.object({
  schemaVersion: z.literal(DISCOVERY_CONTENT_SCHEMA_VERSION),
  locale: discoveryLocaleSchema,
  title: z.string().min(1),
  body: z.array(contentBlockSchema),
  categories: z.array(categorySchema),
  lifeEvents: z.array(lifeEventSchema),
})
export type DiscoveryContent = z.infer<typeof discoveryContentSchema>

export const staticContentManifestSchema = z.object({
  schemaVersion: z.literal(DISCOVERY_CONTENT_SCHEMA_VERSION),
  mode: z.enum(["mock", "proxy"]),
  generatedAt: z.iso.datetime(),
  locales: z.array(discoveryLocaleSchema),
})
export type StaticContentManifest = z.infer<typeof staticContentManifestSchema>

export const STATIC_CONTENT_FILES = {
  manifest: "manifest.json",
  discovery: (locale: DiscoveryLocale) => `discovery.${locale}.json`,
} as const
