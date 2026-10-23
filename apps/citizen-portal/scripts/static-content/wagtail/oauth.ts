import { z } from "zod"
import { REQUEST_TIMEOUT_MS } from "../config.ts"
import { ContentFetchError } from "./client.ts"

// Renew this long before the token expires, so a request started just before
// expiry doesn't arrive with a dead token.
const EXPIRY_MARGIN_MS = 30_000

export type TokenSource = {
  getToken(): Promise<string>
  // Drops `token` after a 401 so the next getToken() fetches a new one. A
  // token that has already been replaced is left alone.
  invalidate(token: string): void
}

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().refine((type) => type.toLowerCase() === "bearer", {
    message: 'Expected "Bearer"',
  }),
  expires_in: z.number().positive().optional(),
})

type CachedToken = { token: string; expiresAt: number }

export function createClientCredentialsTokenSource(options: {
  tokenUrl: string
  clientId: string
  clientSecret: string
  scope?: string
  fetch?: typeof fetch
  now?: () => number
}): TokenSource {
  const fetchFn = options.fetch ?? fetch
  const now = options.now ?? Date.now
  let cached: CachedToken | undefined
  let pending: Promise<CachedToken> | undefined

  async function requestToken(): Promise<CachedToken> {
    const request = `POST ${options.tokenUrl}`
    // RFC 6749 §2.3.1: client credentials go form-encoded into Basic auth.
    const credentials = Buffer.from(
      `${encodeURIComponent(options.clientId)}:${encodeURIComponent(options.clientSecret)}`,
    ).toString("base64")

    let response: Response
    try {
      response = await fetchFn(options.tokenUrl, {
        method: "POST",
        headers: {
          authorization: `Basic ${credentials}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: options.scope ?? "read",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new ContentFetchError(`${request} failed: ${describeError(error)}`)
    }

    const body = await readJson(response)
    if (response.status !== 200) {
      throw new ContentFetchError(
        `${request} returned ${response.status}${describeOAuthError(body)}`,
      )
    }
    const parsed = tokenResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new ContentFetchError(
        `${request} returned an unexpected response:\n${z.prettifyError(parsed.error)}`,
      )
    }
    const { access_token, expires_in } = parsed.data
    return {
      token: access_token,
      expiresAt:
        expires_in === undefined
          ? Number.POSITIVE_INFINITY
          : now() + expires_in * 1000 - EXPIRY_MARGIN_MS,
    }
  }

  return {
    async getToken() {
      if (cached && now() < cached.expiresAt) return cached.token
      // Concurrent callers share one token request.
      pending ??= requestToken().finally(() => {
        pending = undefined
      })
      cached = await pending
      return cached.token
    },
    invalidate(token) {
      if (cached?.token === token) cached = undefined
    },
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function describeOAuthError(body: unknown): string {
  const parsed = z
    .object({ error: z.string(), error_description: z.string().optional() })
    .safeParse(body)
  if (!parsed.success) return ""
  const { error, error_description } = parsed.data
  return `: ${error}${error_description ? ` (${error_description})` : ""}`
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return `no response within ${REQUEST_TIMEOUT_MS / 1000}s`
    }
    return error.cause instanceof Error
      ? `${error.message} (${error.cause.message})`
      : error.message
  }
  return String(error)
}
