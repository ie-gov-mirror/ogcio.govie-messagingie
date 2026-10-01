"use client"

import {
  Heading,
  Link,
  LinkButton,
  List,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"
import type { ReactNode } from "react"
import { AppLink } from "@/components/navigation/app-link"
import type { ContentBlock, RichTextNode } from "@/lib/discovery-content"

/**
 * Renders the discovery model's blocks through design-system components.
 * The build script has already parsed CMS rich text into an allowlisted
 * node tree, so no CMS HTML is injected here.
 */
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <Stack direction='column' gap={4}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </Stack>
  )
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading":
      return <Heading as='h2'>{block.text}</Heading>
    case "paragraph":
      return <>{renderNodes(block.nodes)}</>
    case "buttons":
      return (
        <Stack direction='row' gap={4} wrap>
          {block.links.map((link) => (
            <LinkButton key={link.href} href={link.href}>
              {link.text}
            </LinkButton>
          ))}
        </Stack>
      )
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

function renderNodes(nodes: RichTextNode[]): ReactNode[] {
  return nodes.map((node, i) => <RichText key={i} node={node} />)
}

function RichText({ node }: { node: RichTextNode }): ReactNode {
  if ("text" in node) return node.text
  const children = renderNodes(node.children)
  switch (node.tag) {
    case "p":
      return <Paragraph>{children}</Paragraph>
    case "ul":
    case "ol":
      return (
        <List
          type={node.tag === "ul" ? "bullet" : "number"}
          items={node.children
            .filter((child) => "tag" in child && child.tag === "li")
            .map((li, i) => (
              <span key={i}>
                {"children" in li && renderNodes(li.children)}
              </span>
            ))}
        />
      )
    case "li":
      return <>{children}</>
    case "b":
    case "strong":
      return <strong>{children}</strong>
    case "i":
    case "em":
      return <em>{children}</em>
    case "br":
      return <br />
    case "a":
      if (node.href.startsWith("/")) {
        return <AppLink href={node.href}>{children}</AppLink>
      }
      return (
        <Link href={node.href} external>
          {children}
        </Link>
      )
    default: {
      const _exhaustive: never = node
      return _exhaustive
    }
  }
}
