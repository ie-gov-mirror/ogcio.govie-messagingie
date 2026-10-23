import sanitizeHtml from "sanitize-html"
import styles from "./message-detail.module.css"

// Same allowlist as messaging-api parseRichText. Applied again here so the
// innerHTML sink only receives HTML this function just sanitized.
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "code",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowProtocolRelative: false,
}

export function SecureEmailViewer({ content }: { content: string }) {
  return (
    <div
      className={styles.richText}
      dangerouslySetInnerHTML={{
        __html: sanitizeHtml(content, RICH_TEXT_OPTIONS),
      }}
    />
  )
}
