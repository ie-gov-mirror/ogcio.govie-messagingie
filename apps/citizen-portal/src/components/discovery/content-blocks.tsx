"use client"

import { Link, LinkButton, List, Stack } from "@ogcio/design-system-react"
import { useLocale } from "next-intl"
import type { ReactNode } from "react"
import { AppLink } from "@/components/navigation/app-link"
import type {
  ContentBlock,
  ContentLink,
  RichTextHeadingLevel,
  RichTextNode,
} from "@/lib/discovery"

/**
 * Renders the discovery model's blocks through design-system components.
 * The build script has already parsed CMS rich text into an allowlisted
 * node tree, so no CMS HTML is injected here.
 *
 * `gi-prose` on the article sets type and spacing for every heading and
 * paragraph. Those elements stay unclassed so the prose rules apply.
 */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  if (blocks.length === 0) return null

  return (
    <article className='gi-prose'>
      {blocks.map((block, i) =>
        block.type === "buttonLinks" ? (
          <Stack key={i} direction='row' gap={4} wrap>
            {block.links.map((link) => (
              <ButtonLink key={link.href} link={link} />
            ))}
          </Stack>
        ) : (
          <Block key={i} block={block} />
        ),
      )}
    </article>
  )
}

/** Internal hrefs are locale-relative (`/discovery/…`). */
export function contentHref(
  { href, internal }: Pick<ContentLink, "href" | "internal">,
  locale: string,
) {
  return internal ? `/${locale}${href}` : href
}

function useHref(link: Pick<ContentLink, "href" | "internal">) {
  return contentHref(link, useLocale())
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading":
      return <h2>{block.text}</h2>
    case "richText":
      return <>{renderNodes(block.nodes)}</>
    case "buttonLinks":
      return null
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

/** An email link opens the mail app, not a new tab. */
export function opensInNewTab({
  href,
  internal,
}: Pick<ContentLink, "href" | "internal">) {
  return !internal && !href.startsWith("mailto:")
}

function ButtonLink({ link }: { link: ContentLink }) {
  return (
    <LinkButton external={opensInNewTab(link)} href={useHref(link)}>
      {link.text}
    </LinkButton>
  )
}

const HEADING_TAG = {
  2: "h2",
  3: "h3",
  4: "h4",
} as const satisfies Record<RichTextHeadingLevel, "h2" | "h3" | "h4">

function renderNodes(nodes: RichTextNode[]): ReactNode[] {
  return nodes.map((node, i) => <RichText key={i} node={node} />)
}

function RichText({ node }: { node: RichTextNode }): ReactNode {
  switch (node.type) {
    case "text":
      return node.value
    case "lineBreak":
      return <br />
    case "paragraph":
      return <p>{renderNodes(node.children)}</p>
    case "heading": {
      const Tag = HEADING_TAG[node.level]
      return <Tag>{renderNodes(node.children)}</Tag>
    }
    case "list":
      return (
        <List
          type={node.ordered ? "number" : "bullet"}
          items={node.children.map((item, i) => (
            <span key={i}>
              {renderNodes("children" in item ? item.children : [item])}
            </span>
          ))}
        />
      )
    case "listItem":
      return <>{renderNodes(node.children)}</>
    case "strong":
      return <strong>{renderNodes(node.children)}</strong>
    case "emphasis":
      return <em>{renderNodes(node.children)}</em>
    case "link":
      return <RichTextLink node={node} />
    default: {
      const _exhaustive: never = node
      return _exhaustive
    }
  }
}

function RichTextLink({
  node,
}: {
  node: Extract<RichTextNode, { type: "link" }>
}) {
  const href = useHref(node)
  const children = renderNodes(node.children)
  if (node.internal) return <AppLink href={href}>{children}</AppLink>
  return (
    <Link href={href} external={opensInNewTab(node)}>
      {children}
    </Link>
  )
}
