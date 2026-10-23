// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  IssueCollector,
  parseRichText,
} from "../../scripts/static-content/pipeline/index.ts"

const baby = {
  path: "/discovery/having-a-baby",
  title: { en: "Having a baby", ga: "Leanbh a bheith agat" },
}
const linkTargets = new Map([
  [1001, baby],
  [2001, baby],
])

function parse(html: string) {
  const issues = new IssueCollector()
  const nodes = parseRichText(html, {
    document: "en:1100 LifeEventPage",
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

  it.each([2, 3, 4] as const)("maps <h%i> to a heading", (level) => {
    const { nodes, issues } = parse(
      `<h${level} data-block-key="k">Sort out <b>leave</b></h${level}>`,
    )
    expect(issues.errors).toEqual([])
    expect(nodes).toEqual([
      {
        type: "heading",
        level,
        children: [
          { type: "text", value: "Sort out " },
          { type: "strong", children: [{ type: "text", value: "leave" }] },
        ],
      },
    ])
  })

  it.each([
    [1, 2],
    [5, 4],
    [6, 4],
  ] as const)("shows <h%i> as <h%i>, with a warning", (from, to) => {
    const { nodes, issues } = parse(`<h${from}>Title</h${from}>`)
    expect(issues.errors).toEqual([])
    expect(nodes).toEqual([
      {
        type: "heading",
        level: to,
        children: [{ type: "text", value: "Title" }],
      },
    ])
    expect(issues.warnings).toEqual([
      {
        document: "en:1100 LifeEventPage",
        path: "body[0].value",
        rule: "rich-text-heading-level",
        message: `<h${from}> is shown as <h${to}>; rich text supports h2–h4`,
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

  it.each([
    "mailto:jobseekersforms@welfare.ie",
    "mailto:a@b.ie?subject=Form%20UP1",
  ])("keeps the email link %s", (href) => {
    const { nodes, issues } = parse(`<p><a href="${href}">x</a></p>`)
    expect(issues.errors).toEqual([])
    expect(nodes[0]).toMatchObject({
      children: [{ type: "link", href, internal: false }],
    })
  })

  it.each([
    "http://gov.ie/",
    "/relative",
    "mailto:",
    "mailto:not-an-address",
    "javascript:alert(1)",
    "tel:+35312345678",
  ])("rejects the external link %s", (href) => {
    expect(rules(`<p><a href="${href}">x</a></p>`)).toEqual([
      "external-link-https",
    ])
  })

  it.each([1001, 2001])(
    "keeps a link to discovery page %i, EN or GA, in the app",
    (id) => {
      const { nodes, issues } = parse(
        `<p><a href="https://www.gov.ie/en/having-a-baby/" data-page-id="${id}" data-api-url="https://api.example/v2/pages/${id}/">x</a></p>`,
      )
      expect(issues.errors).toEqual([])
      expect(nodes[0]).toMatchObject({
        children: [
          { type: "link", href: "/discovery/having-a-baby", internal: true },
        ],
      })
    },
  )

  it("links any other page, or a document, to its gov.ie URL", () => {
    const { nodes, issues } = parse(
      '<p><a href="https://www.gov.ie/en/p/" data-page-id="999">p</a><a href="https://www.gov.ie/doc.pdf" data-document-id="7">d</a></p>',
    )
    expect(issues.errors).toEqual([])
    expect(nodes[0]).toMatchObject({
      children: [
        { type: "link", href: "https://www.gov.ie/en/p/", internal: false },
        { type: "link", href: "https://www.gov.ie/doc.pdf", internal: false },
      ],
    })
  })

  it.each([
    [
      '<p><a href="https://gov.ie" data-page-id="abc">x</a></p>',
      "rich-text-attribute",
    ],
    [
      '<p><a href="http://gov.ie" data-page-id="999">x</a></p>',
      "external-link-https",
    ],
    ['<p><a linktype="page" id="1001">x</a></p>', "rich-text-attribute"],
    [
      '<p><a href="https://gov.ie" target="_blank">x</a></p>',
      "rich-text-attribute",
    ],
    ["<p><a>x</a></p>", "rich-text-attribute"],
    ['<embed embedtype="image" id="1"/>', "rich-text-embed"],
    ["<h7>x</h7>", "rich-text-element"],
    ["<script>alert(1)</script>", "rich-text-element"],
    ["<p><!-- note -->x</p>", "rich-text-element"],
    ['<p class="lead">x</p>', "rich-text-attribute"],
  ])("rejects %s", (html, rule) => {
    const { issues } = parse(html)
    expect(issues.errors.map((e) => e.rule)).toEqual([rule])
    expect(issues.errors[0]).toMatchObject({
      document: "en:1100 LifeEventPage",
      path: "body[0].value",
    })
  })
})
