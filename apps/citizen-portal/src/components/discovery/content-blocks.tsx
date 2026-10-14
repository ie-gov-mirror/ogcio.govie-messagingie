"use client"

import {
  Heading,
  Link,
  LinkButton,
  List,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"
import { useLocale } from "next-intl"
import type { ReactNode } from "react"
import { AppLink } from "@/components/navigation/app-link"
import type { ContentBlock, ContentLink, RichTextNode } from "@/lib/discovery"

/**
 * Renders the discovery model's blocks through design-system components.
 * The build script has already parsed CMS rich text into an allowlisted
 * node tree, so no CMS HTML is injected here.
 *
 * Each CMS heading starts a section (heading-to-body gap 8). Sections and
 * button rows are separated by 24px, 32px from the md breakpoint.
 */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  const sections = groupSections(blocks)
  if (sections.length === 0) return null

  return (
    <Stack direction='column' gap={{ base: 6, md: 8 }}>
      {sections.map((section) =>
        section.kind === "buttons" ? (
          <Stack key={section.key} direction='row' gap={4} wrap>
            {section.links.map((link) => (
              <ButtonLink key={link.href} link={link} />
            ))}
          </Stack>
        ) : (
          <Stack key={section.key} direction='column' gap={2}>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </Stack>
        ),
      )}
    </Stack>
  )
}

/** First paragraph of a page, rendered at the intro size. */
export function LeadParagraph({ nodes }: { nodes: RichTextNode[] }) {
  return <Paragraph size='lg'>{renderNodes(nodes)}</Paragraph>
}

type Section =
  | { kind: "copy"; key: number; blocks: ContentBlock[] }
  | {
      kind: "buttons"
      key: number
      links: Extract<ContentBlock, { type: "buttonLinks" }>["links"]
    }

function groupSections(blocks: ContentBlock[]): Section[] {
  const sections: Section[] = []
  let copy: ContentBlock[] | null = null
  let key = 0

  const flush = () => {
    if (!copy?.length) {
      copy = null
      return
    }
    sections.push({ kind: "copy", key: key++, blocks: copy })
    copy = null
  }

  for (const block of blocks) {
    if (block.type === "buttonLinks") {
      flush()
      sections.push({ kind: "buttons", key: key++, links: block.links })
      continue
    }
    if (block.type === "heading") flush()
    copy ??= []
    copy.push(block)
  }
  flush()
  return sections
}

/** Internal hrefs are locale-relative (`/discovery/…`). */
function useHref({ href, internal }: Pick<ContentLink, "href" | "internal">) {
  const locale = useLocale()
  return internal ? `/${locale}${href}` : href
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <Heading as='h2' size='sm'>
          {block.text}
        </Heading>
      )
    case "richText":
      return <>{renderNodes(block.nodes)}</>
    case "buttonLinks":
      // Own section in ContentBlocks, so it gets the 24/32 gap, not the 8px one.
      return null
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

function ButtonLink({ link }: { link: ContentLink }) {
  return (
    <LinkButton external={!link.internal} href={useHref(link)}>
      {link.text}
    </LinkButton>
  )
}

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
      return <Paragraph>{renderNodes(node.children)}</Paragraph>
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
    <Link href={href} external>
      {children}
    </Link>
  )
}
