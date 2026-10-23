import { z } from "zod"

// Only the fields we read, in the gov.ie Integration API's shape (see
// openapi.yaml). Objects are loose so fields Carbon adds later pass through
// (ADR §6).

const aliasOfSchema = z.looseObject({ id: z.number().int() }).nullable()

export const pageRefSchema = z.looseObject({
  id: z.number().int(),
  meta: z.looseObject({
    type: z.string(),
    locale: z.string(),
    alias_of: aliasOfSchema.optional(),
  }),
})
export type PageRef = z.infer<typeof pageRefSchema>

export const listingSchema = z.looseObject({
  meta: z.looseObject({ total_count: z.number().int().nonnegative() }),
  items: z.array(pageRefSchema),
})

const pageMetaSchema = z.looseObject({
  type: z.string(),
  slug: z.string(),
  locale: z.string(),
  // .optional() alone would accept a missing field.
  alias_of: aliasOfSchema,
})

const blockId = z.string()

const headingBlockSchema = z.looseObject({
  type: z.literal("heading"),
  value: z.string().trim().min(1),
  id: blockId,
})

const paragraphBlockSchema = z.looseObject({
  type: z.literal("paragraph"),
  value: z.string(),
  id: blockId,
})

// Link text may be empty: the link then shows its page's title or its URL.
const externalLinkSchema = z.looseObject({
  type: z.literal("external_link"),
  value: z.looseObject({ link_url: z.string(), link_text: z.string() }),
  id: blockId,
})

const internalLinkSchema = z.looseObject({
  type: z.literal("internal_link"),
  value: z.looseObject({
    page: z.number().int(),
    link_text: z.string(),
    url: z.string(),
  }),
  id: blockId,
})

export const linkBlockSchema = z.discriminatedUnion("type", [
  externalLinkSchema,
  internalLinkSchema,
])
export type LinkBlock = z.infer<typeof linkBlockSchema>

const buttonLinkBlockSchema = z.looseObject({
  type: z.literal("button_link"),
  value: z.array(linkBlockSchema).min(1),
  id: blockId,
})

export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  buttonLinkBlockSchema,
])
export type Block = z.infer<typeof blockSchema>

const serviceBlockSchema = z.looseObject({
  type: z.literal("service"),
  value: z.looseObject({
    link: z.array(linkBlockSchema).length(1),
    description: z.string().nullish(),
  }),
  id: blockId,
})
export type ServiceBlock = z.infer<typeof serviceBlockSchema>

const basePageSchema = z.looseObject({
  id: z.number().int(),
  title: z.string().trim().min(1),
  meta: pageMetaSchema,
  body: z.array(blockSchema),
})

const categoryBlockSchema = z.looseObject({
  type: z.literal("category"),
  value: z.looseObject({
    title: z.string().trim().min(1),
    icon: z.string().trim().min(1),
    life_events: z.array(z.looseObject({ id: z.number().int() })),
  }),
  id: blockId,
})

// A service card can link to one of these. Only a page with a body becomes
// a route; an empty one stays an outbound link.
export const servicePageSchema = basePageSchema
export type ServicePage = z.infer<typeof servicePageSchema>

export const listPageSchema = basePageSchema.extend({
  categories: z.array(categoryBlockSchema).min(1),
})
export type ListPage = z.infer<typeof listPageSchema>

export const lifeEventPageSchema = basePageSchema.extend({
  highlighted: z.boolean().nullish(),
  services: z.array(serviceBlockSchema),
  guidance: z.array(linkBlockSchema),
})
export type LifeEventPage = z.infer<typeof lifeEventPageSchema>
