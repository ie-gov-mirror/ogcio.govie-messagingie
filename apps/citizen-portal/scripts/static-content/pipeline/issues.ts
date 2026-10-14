import type { z } from "zod"

export type ContentIssue = {
  document: string
  path: string
  rule: string
  message: string
}

export class IssueCollector {
  readonly errors: ContentIssue[] = []
  readonly warnings: ContentIssue[] = []

  error(issue: ContentIssue): void {
    this.errors.push(issue)
  }

  warn(issue: ContentIssue): void {
    this.warnings.push(issue)
  }

  get hasErrors(): boolean {
    return this.errors.length > 0
  }
}

export function formatIssue(issue: ContentIssue): string {
  return `${issue.document} ${issue.path || "(root)"}: [${issue.rule}] ${issue.message}`
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`
    const key = String(segment)
    return acc ? `${acc}.${key}` : key
  }, "")
}

export function describePage(page: {
  id: number
  meta: { type: string; locale: string; slug?: unknown }
}): string {
  const type = page.meta.type.split(".").pop() ?? page.meta.type
  const slug = typeof page.meta.slug === "string" ? ` "${page.meta.slug}"` : ""
  return `${page.meta.locale}:${page.id} ${type}${slug}`
}

export function reportZodError(
  issues: IssueCollector,
  document: string,
  error: z.ZodError,
): void {
  for (const issue of error.issues) {
    const unknownBlock =
      issue.code === "invalid_union" &&
      "discriminator" in issue &&
      issue.discriminator === "type" &&
      issue.path.at(-1) === "type"
    issues.error({
      document,
      path: formatPath(issue.path),
      rule: unknownBlock ? "unknown-block-type" : "schema",
      message: issue.message,
    })
  }
}
