import { type DefaultTreeAdapterTypes, parseFragment } from "parse5"
import {
  RICH_TEXT_HEADING_LEVELS,
  type RichTextHeadingLevel,
  type RichTextNode,
} from "../../../src/lib/discovery/index.ts"
import type { IssueCollector } from "./issues.ts"
import { EXTERNAL_HREF_RULE, isExternalHref, type LinkTarget } from "./links.ts"

type Node = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element

export type RichTextContext = {
  document: string
  path: string
  linkTargets: ReadonlyMap<number, LinkTarget>
  issues: IssueCollector
}

const ELEMENTS = {
  p: "paragraph",
  li: "listItem",
  b: "strong",
  strong: "strong",
  i: "emphasis",
  em: "emphasis",
} as const

// Every HTML heading is accepted, so an editor's choice of level never fails
// the build: one outside h2–h4 moves to the nearest of them, with a warning.
const HEADING_TAG = /^h([1-6])$/
const MIN_HEADING = RICH_TEXT_HEADING_LEVELS[0]
const MAX_HEADING =
  RICH_TEXT_HEADING_LEVELS[RICH_TEXT_HEADING_LEVELS.length - 1]

function headingLevel(tag: string): number | undefined {
  const match = HEADING_TAG.exec(tag)
  return match ? Number(match[1]) : undefined
}

// Wagtail 4+ adds `data-block-key` to block-level elements; it carries no
// meaning, so it's the one attribute accepted outside `<a>`.
const IGNORED_ATTRIBUTES = new Set(["data-block-key"])

export function parseRichText(
  html: string,
  context: RichTextContext,
): RichTextNode[] {
  return convertChildren(parseFragment(html).childNodes, context)
}

function convertChildren(
  nodes: readonly Node[],
  context: RichTextContext,
): RichTextNode[] {
  return nodes.flatMap((node) => {
    const converted = convertNode(node, context)
    return converted ? [converted] : []
  })
}

function convertNode(
  node: Node,
  context: RichTextContext,
): RichTextNode | undefined {
  if (node.nodeName === "#text") {
    return {
      type: "text",
      value: (node as DefaultTreeAdapterTypes.TextNode).value,
    }
  }
  if (!("tagName" in node)) {
    fail(context, "rich-text-element", `${node.nodeName} isn't allowed`)
    return undefined
  }

  const tag = node.tagName
  if (tag === "a") return convertLink(node, context)
  if (tag === "embed") {
    fail(context, "rich-text-embed", "<embed> isn't allowed")
    return undefined
  }
  if (
    !(tag in ELEMENTS) &&
    headingLevel(tag) === undefined &&
    !["ul", "ol", "br"].includes(tag)
  ) {
    fail(context, "rich-text-element", `<${tag}> isn't allowed`)
    return undefined
  }

  for (const attr of node.attrs) {
    if (!IGNORED_ATTRIBUTES.has(attr.name)) {
      fail(
        context,
        "rich-text-attribute",
        `attribute "${attr.name}" isn't allowed on <${tag}>`,
      )
    }
  }

  if (tag === "br") return { type: "lineBreak" }
  const children = convertChildren(node.childNodes, context)
  if (tag === "ul" || tag === "ol") {
    return { type: "list", ordered: tag === "ol", children }
  }
  const level = headingLevel(tag)
  if (level !== undefined) {
    return { type: "heading", level: supportedLevel(level, context), children }
  }
  return { type: ELEMENTS[tag as keyof typeof ELEMENTS], children }
}

// The API resolves links: `href` is always absolute, a page link adds
// `data-page-id` and `data-api-url`, a document link `data-document-id`.
const LINK_ATTRIBUTES = new Set([
  "href",
  "data-page-id",
  "data-api-url",
  "data-document-id",
])

function convertLink(
  node: Element,
  context: RichTextContext,
): RichTextNode | undefined {
  const attrs = new Map(node.attrs.map((a) => [a.name, a.value]))
  const children = convertChildren(node.childNodes, context)

  const unknown = [...attrs.keys()].filter((name) => !LINK_ATTRIBUTES.has(name))
  const href = attrs.get("href")
  if (href === undefined || unknown.length > 0) {
    fail(
      context,
      "rich-text-attribute",
      `<a> must have an href and only ${[...LINK_ATTRIBUTES].join(", ")} (got ${[...attrs.keys()].join(", ") || "none"})`,
    )
    return undefined
  }

  const pageId = attrs.get("data-page-id")
  if (pageId !== undefined) {
    const id = Number(pageId)
    if (!Number.isInteger(id)) {
      fail(
        context,
        "rich-text-attribute",
        `data-page-id must be a page ID (got "${pageId}")`,
      )
      return undefined
    }
    // A discovery page stays in the app; any other page is a gov.ie link.
    const target = context.linkTargets.get(id)
    if (target) {
      return { type: "link", href: target.path, internal: true, children }
    }
  }

  if (!isExternalHref(href)) {
    fail(context, "external-link-https", `"${href}" ${EXTERNAL_HREF_RULE}`)
    return undefined
  }
  return { type: "link", href, internal: false, children }
}

function supportedLevel(
  level: number,
  context: RichTextContext,
): RichTextHeadingLevel {
  const supported = Math.min(
    Math.max(level, MIN_HEADING),
    MAX_HEADING,
  ) as RichTextHeadingLevel
  if (supported !== level) {
    context.issues.warn({
      document: context.document,
      path: context.path,
      rule: "rich-text-heading-level",
      message: `<h${level}> is shown as <h${supported}>; rich text supports h${MIN_HEADING}–h${MAX_HEADING}`,
    })
  }
  return supported
}

function fail(context: RichTextContext, rule: string, message: string): void {
  context.issues.error({
    document: context.document,
    path: context.path,
    rule,
    message,
  })
}
