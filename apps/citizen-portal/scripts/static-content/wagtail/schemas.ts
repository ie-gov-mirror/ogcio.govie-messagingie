import { z } from "zod"

// Only the fields we read. Objects are loose so fields Carbon adds later
// pass through (ADR §6).

export const pageRefSchema = z.looseObject({
  id: z.number().int(),
  meta: z.looseObject({
    type: z.string(),
    locale: z.string(),
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
  // z.unknown() alone would accept a missing field.
  alias_of: z.unknown().refine((value) => value !== undefined, "Required"),
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

const externalLinkSchema = z.looseObject({
  type: z.literal("external_link"),
  value: z.looseObject({
    link_url: z.string(),
    link_text: z.string().trim().min(1),
  }),
  id: blockId,
})

const buttonLinkBlockSchema = z.looseObject({
  type: z.literal("button_link"),
  value: z.array(externalLinkSchema).min(1),
  id: blockId,
})

export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  buttonLinkBlockSchema,
])
export type Block = z.infer<typeof blockSchema>

const basePageSchema = z.looseObject({
  id: z.number().int(),
  title: z.string().trim().min(1),
  meta: pageMetaSchema,
  body: z.array(blockSchema),
})

const categorySchema = z.looseObject({
  key: z.string().trim().min(1),
  title: z.string().trim().min(1),
  icon: z.string().trim().min(1),
  life_events: z.array(z.number().int()),
})

export const listPageSchema = basePageSchema.extend({
  categories: z.array(categorySchema).min(1),
})
export type ListPage = z.infer<typeof listPageSchema>

const discoveryPageFields = {
  summary: z.string().nullish(),
  highlighted: z.boolean().nullish(),
}

export const lifeEventPageSchema = basePageSchema.extend(discoveryPageFields)
export type LifeEventPage = z.infer<typeof lifeEventPageSchema>

export const journeyPageSchema = basePageSchema.extend(discoveryPageFields)
export type JourneyPage = z.infer<typeof journeyPageSchema>
