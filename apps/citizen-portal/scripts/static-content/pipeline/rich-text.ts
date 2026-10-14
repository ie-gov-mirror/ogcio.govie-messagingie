import { type DefaultTreeAdapterTypes, parseFragment } from "parse5"
import type { RichTextNode } from "../../../src/lib/discovery/index.ts"
import type { IssueCollector } from "./issues.ts"
import { isHttpsUrl } from "./links.ts"

type Node = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element

export type RichTextContext = {
  document: string
  path: string
  linkTargets: ReadonlyMap<number, string>
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
  if (!(tag in ELEMENTS) && !["ul", "ol", "br"].includes(tag)) {
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
  return { type: ELEMENTS[tag as keyof typeof ELEMENTS], children }
}

function convertLink(
  node: Element,
  context: RichTextContext,
): RichTextNode | undefined {
  const attrs = new Map(node.attrs.map((a) => [a.name, a.value]))
  const children = convertChildren(node.childNodes, context)
  const linktype = attrs.get("linktype")

  if (linktype === undefined) {
    const href = attrs.get("href")
    if (href === undefined || attrs.size !== 1) {
      fail(
        context,
        "rich-text-attribute",
        `<a> must have either only href, or linktype="page" and id (got ${[...attrs.keys()].join(", ") || "none"})`,
      )
      return undefined
    }
    if (!isHttpsUrl(href)) {
      fail(
        context,
        "external-link-https",
        `"${href}" isn't an absolute https URL`,
      )
      return undefined
    }
    return { type: "link", href, internal: false, children }
  }

  if (linktype !== "page") {
    fail(
      context,
      linktype === "document" ? "rich-text-document-link" : "rich-text-link",
      `linktype="${linktype}" isn't allowed`,
    )
    return undefined
  }

  const id = Number(attrs.get("id"))
  if (!Number.isInteger(id)) {
    fail(
      context,
      "rich-text-attribute",
      `<a linktype="page"> must have a numeric id (got ${attrs.get("id") ?? "none"})`,
    )
    return undefined
  }
  const href = context.linkTargets.get(id)
  if (href === undefined) {
    fail(
      context,
      "internal-link-unknown-page",
      `page ${id} isn't a discovery page`,
    )
    return undefined
  }
  return { type: "link", href, internal: true, children }
}

function fail(context: RichTextContext, rule: string, message: string): void {
  context.issues.error({
    document: context.document,
    path: context.path,
    rule,
    message,
  })
}
