// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import {
  ContentFetchError,
  createClientCredentialsTokenSource,
  createHttpTransport,
  createWagtailClient,
  type TokenSource,
} from "../../scripts/static-content/wagtail/index.ts"

const TOKEN_URL = "https://cms.example/o/token/"
const BASE_URL = "https://cms.example/"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function tokenResponse(token: string, expiresIn?: number): Response {
  return json({
    access_token: token,
    token_type: "Bearer",
    ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
  })
}

function tokenSource(
  fetch: typeof globalThis.fetch,
  now?: () => number,
): TokenSource {
  return createClientCredentialsTokenSource({
    tokenUrl: TOKEN_URL,
    clientId: "client id",
    clientSecret: "s3cret:&",
    fetch,
    now,
  })
}

function fixedTokens(...tokens: string[]): TokenSource {
  let i = 0
  return {
    getToken: vi.fn(async () => tokens[Math.min(i, tokens.length - 1)]),
    invalidate: vi.fn(() => {
      i++
    }),
  }
}

describe("client credentials token source", () => {
  it("requests a read token with the credentials in Basic auth", async () => {
    const fetch = vi.fn(async () => tokenResponse("t1", 3600))
    expect(await tokenSource(fetch).getToken()).toBe("t1")

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(TOKEN_URL)
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(
      Buffer.from(
        headers.authorization.replace("Basic ", ""),
        "base64",
      ).toString(),
    ).toBe("client%20id:s3cret%3A%26")
    expect(String(init.body)).toBe("grant_type=client_credentials&scope=read")
  })

  it("reuses the token until shortly before it expires", async () => {
    let time = 0
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("t1", 60))
      .mockResolvedValueOnce(tokenResponse("t2", 60))
    const tokens = tokenSource(fetch, () => time)

    expect(await tokens.getToken()).toBe("t1")
    time = 29_000
    expect(await tokens.getToken()).toBe("t1")
    time = 30_000
    expect(await tokens.getToken()).toBe("t2")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("shares one request between concurrent callers", async () => {
    const fetch = vi.fn(async () => tokenResponse("t1", 3600))
    const tokens = tokenSource(fetch)
    expect(await Promise.all([tokens.getToken(), tokens.getToken()])).toEqual([
      "t1",
      "t1",
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("fetches a new token only when the current one is invalidated", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("t1"))
      .mockResolvedValueOnce(tokenResponse("t2"))
    const tokens = tokenSource(fetch)

    expect(await tokens.getToken()).toBe("t1")
    tokens.invalidate("stale")
    expect(await tokens.getToken()).toBe("t1")
    tokens.invalidate("t1")
    expect(await tokens.getToken()).toBe("t2")
  })

  it("reports a rejected client without leaking the secret", async () => {
    const tokens = tokenSource(async () =>
      json(
        { error: "invalid_client", error_description: "Bad credentials" },
        401,
      ),
    )
    const error = await tokens.getToken().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ContentFetchError)
    expect((error as Error).message).toBe(
      `POST ${TOKEN_URL} returned 401: invalid_client (Bad credentials)`,
    )
    expect((error as Error).message).not.toContain("s3cret")
  })

  it("rejects a response that isn't a bearer token", async () => {
    const tokens = tokenSource(async () =>
      json({ access_token: "t1", token_type: "mac" }),
    )
    await expect(tokens.getToken()).rejects.toThrow(/unexpected response/)
  })

  it("retries after a failed request", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(tokenResponse("t1"))
    const tokens = tokenSource(fetch)

    await expect(tokens.getToken()).rejects.toThrow(
      `POST ${TOKEN_URL} failed: fetch failed`,
    )
    expect(await tokens.getToken()).toBe("t1")
  })
})

describe("http transport", () => {
  it("sends the query and bearer token to the API", async () => {
    const fetch = vi.fn(async () => json({ meta: { total_count: 0 } }))
    const transport = createHttpTransport({
      baseUrl: "https://cms.example/prefix/",
      tokens: fixedTokens("t1"),
      fetch,
    })

    const response = await transport.get("/v2/pages/", {
      child_of: 203578,
      type: "life_events.LifeEventPage",
      fields: "*",
    })

    expect(response).toEqual({
      status: 200,
      body: { meta: { total_count: 0 } },
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe(
      "https://cms.example/prefix/v2/pages/?child_of=203578&type=life_events.LifeEventPage&fields=*",
    )
    expect(init.headers).toMatchObject({ authorization: "Bearer t1" })
  })

  it("retries a 401 once with a new token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "Expired" }, 401))
      .mockResolvedValueOnce(json({ id: 1 }))
    const tokens = fixedTokens("t1", "t2")
    const transport = createHttpTransport({ baseUrl: BASE_URL, tokens, fetch })

    expect(await transport.get("/v2/pages/1/")).toEqual({
      status: 200,
      body: { id: 1 },
    })
    expect(tokens.invalidate).toHaveBeenCalledWith("t1")
    const authorizations = fetch.mock.calls.map(
      ([, init]) =>
        (init as RequestInit & { headers: Record<string, string> }).headers
          .authorization,
    )
    expect(authorizations).toEqual(["Bearer t1", "Bearer t2"])
  })

  it("returns a second 401 for the client to report", async () => {
    const transport = createHttpTransport({
      baseUrl: BASE_URL,
      tokens: fixedTokens("t1", "t2"),
      fetch: async () =>
        json({ detail: "Authentication credentials were not provided." }, 401),
    })
    await expect(createWagtailClient(transport).getPage(1)).rejects.toThrow(
      "GET /v2/pages/1/ returned 401: Authentication credentials were not provided.",
    )
  })

  it("passes a non-JSON error page through as text", async () => {
    const transport = createHttpTransport({
      baseUrl: BASE_URL,
      tokens: fixedTokens("t1"),
      fetch: async () =>
        new Response("<html>Bad gateway</html>", { status: 502 }),
    })
    expect(await transport.get("/v2/pages/1/")).toEqual({
      status: 502,
      body: "<html>Bad gateway</html>",
    })
  })

  it("names the request when there's no response", async () => {
    const transport = createHttpTransport({
      baseUrl: BASE_URL,
      tokens: fixedTokens("t1"),
      fetch: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError")
      },
    })
    await expect(transport.get("/v2/pages/1/")).rejects.toThrow(
      "GET https://cms.example/v2/pages/1/ failed: no response within 60s",
    )
  })
})
