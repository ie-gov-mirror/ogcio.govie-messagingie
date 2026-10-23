import { REQUEST_TIMEOUT_MS } from "../config.ts"
import { ContentFetchError } from "./client.ts"
import { describeError, type TokenSource } from "./oauth.ts"
import type { Transport, TransportResponse } from "./transport.ts"

// Talks to the gov.ie Integration API. Like the mock transport it returns
// every status to the client, which owns the error messages; only a request
// that gets no response at all throws.
export function createHttpTransport(options: {
  // Ends in "/" (readConfig ensures it), so paths resolve under any prefix.
  baseUrl: string
  tokens: TokenSource
  fetch?: typeof fetch
}): Transport {
  const fetchFn = options.fetch ?? fetch

  async function send(url: URL, token: string): Promise<Response> {
    try {
      return await fetchFn(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new ContentFetchError(`GET ${url} failed: ${describeError(error)}`)
    }
  }

  return {
    async get(path, query = {}) {
      const url = new URL(path.replace(/^\//, ""), options.baseUrl)
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value))
      }

      const token = await options.tokens.getToken()
      let response = await send(url, token)
      // The token can be revoked or expire early; retry once with a new one.
      if (response.status === 401) {
        options.tokens.invalidate(token)
        response = await send(url, await options.tokens.getToken())
      }
      return toTransportResponse(response)
    },
  }
}

async function toTransportResponse(
  response: Response,
): Promise<TransportResponse> {
  const text = await response.text()
  try {
    return { status: response.status, body: JSON.parse(text) }
  } catch {
    // An HTML error page from a gateway, say. The client reports the status.
    return { status: response.status, body: text }
  }
}
