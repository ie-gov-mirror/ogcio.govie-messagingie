// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  IssueCollector,
  parseRichText,
} from "../../scripts/static-content/pipeline/index.ts"

const linkTargets = new Map([
  [1001, "/discovery/having-a-baby"],
  [5001, "/discovery/having-a-baby"],
])

function parse(html: string) {
  const issues = new IssueCollector()
  const nodes = parseRichText(html, {
    document: "en:1100 JourneyPage",
    path: "body[0].value",
    linkTargets,
    issues,
  })
  return { nodes, issues }
}

function rules(html: string): string[] {
  return parse(html).issues.errors.map((e) => e.rule)
}

describe("parseRichText", () => {
  it("maps the allowed elements to nodes", () => {
    const { nodes, issues } = parse(
      "<p>a <b>b</b> <strong>s</strong> <i>i</i> <em>e</em><br>c</p><ol><li>one</li></ol><ul><li>two</li></ul>",
    )
    expect(issues.errors).toEqual([])
    expect(nodes).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "a " },
          { type: "strong", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " " },
          { type: "strong", children: [{ type: "text", value: "s" }] },
          { type: "text", value: " " },
          { type: "emphasis", children: [{ type: "text", value: "i" }] },
          { type: "text", value: " " },
          { type: "emphasis", children: [{ type: "text", value: "e" }] },
          { type: "lineBreak" },
          { type: "text", value: "c" },
        ],
      },
      {
        type: "list",
        ordered: true,
        children: [
          { type: "listItem", children: [{ type: "text", value: "one" }] },
        ],
      },
      {
        type: "list",
        ordered: false,
        children: [
          { type: "listItem", children: [{ type: "text", value: "two" }] },
        ],
      },
    ])
  })

  it("accepts Wagtail's data-block-key attribute", () => {
    expect(rules('<p data-block-key="x1">a</p>')).toEqual([])
  })

  it("keeps https external links", () => {
    const { nodes, issues } = parse('<p><a href="https://gov.ie/">x</a></p>')
    expect(issues.errors).toEqual([])
    expect(nodes[0]).toMatchObject({
      children: [{ type: "link", href: "https://gov.ie/", internal: false }],
    })
  })

  it.each(["http://gov.ie/", "/relative", "mailto:a@b.ie"])(
    "rejects the external link %s",
    (href) => {
      expect(rules(`<p><a href="${href}">x</a></p>`)).toEqual([
        "external-link-https",
      ])
    },
  )

  it.each([1001, 5001])(
    "resolves an internal link to page %i, EN or GA",
    (id) => {
      const { nodes, issues } = parse(
        `<p><a linktype="page" id="${id}">x</a></p>`,
      )
      expect(issues.errors).toEqual([])
      expect(nodes[0]).toMatchObject({
        children: [
          { type: "link", href: "/discovery/having-a-baby", internal: true },
        ],
      })
    },
  )

  it("ignores extra attributes on page links", () => {
    const { nodes, issues } = parse(
      '<p><a linktype="page" id="1001" class="c" href="/having-a-baby/">x</a></p>',
    )
    expect(issues.errors).toEqual([])
    expect(nodes[0]).toMatchObject({
      children: [
        { type: "link", href: "/discovery/having-a-baby", internal: true },
      ],
    })
  })

  it("accepts an href on a page link, and still resolves it by page ID", () => {
    const { nodes, issues } = parse(
      '<p><a linktype="page" id="1001" href="/en/somewhere-else/">x</a></p>',
    )
    expect(issues.errors).toEqual([])
    expect(nodes[0]).toMatchObject({
      children: [
        { type: "link", href: "/discovery/having-a-baby", internal: true },
      ],
    })
  })

  it.each([
    ['<p><a linktype="page" id="999">x</a></p>', "internal-link-unknown-page"],
    ['<p><a linktype="document" id="1">x</a></p>', "rich-text-document-link"],
    ['<p><a linktype="email" id="1">x</a></p>', "rich-text-link"],
    ['<p><a linktype="page" id="abc">x</a></p>', "rich-text-attribute"],
    ['<p><a linktype="page">x</a></p>', "rich-text-attribute"],
    [
      '<p><a href="https://gov.ie" target="_blank">x</a></p>',
      "rich-text-attribute",
    ],
    ["<p><a>x</a></p>", "rich-text-attribute"],
    ['<embed embedtype="image" id="1"/>', "rich-text-embed"],
    ["<h2>x</h2>", "rich-text-element"],
    ["<script>alert(1)</script>", "rich-text-element"],
    ["<p><!-- note -->x</p>", "rich-text-element"],
    ['<p class="lead">x</p>', "rich-text-attribute"],
  ])("rejects %s", (html, rule) => {
    const { issues } = parse(html)
    expect(issues.errors.map((e) => e.rule)).toEqual([rule])
    expect(issues.errors[0]).toMatchObject({
      document: "en:1100 JourneyPage",
      path: "body[0].value",
    })
  })
})
