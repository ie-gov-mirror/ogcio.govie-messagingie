import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PAGINATION_LIMIT_DEFAULT,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_OFFSET,
  PAGINATION_OFFSET_DEFAULT,
} from "../../types/schemaDefinitions.js";
import {
  formatAPIResponse,
  getPaginationLinks,
  type PaginationDetails,
  sanitizePagination,
} from "../../utils/pagination.js";

const baseUrl = "https://example.com/api/v1/messages";

const buildDetails = (
  overrides: Partial<PaginationDetails> = {},
): PaginationDetails => ({
  url: new URL(baseUrl),
  limit: 10,
  offset: 0,
  ...overrides,
});

const offsetOf = (href: string | undefined): string | null =>
  href ? new URL(href).searchParams.get("offset") : null;

describe("getPaginationLinks", () => {
  it("applies default limit and offset when not provided", () => {
    const links = getPaginationLinks({ url: new URL(baseUrl) }, 1);

    expect(new URL(links.self.href).searchParams.get("limit")).toBe(
      PAGINATION_LIMIT_DEFAULT.toString(),
    );
    expect(offsetOf(links.self.href)).toBe("0");
  });

  it("computes self, next, prev, first and last for a middle page", () => {
    const links = getPaginationLinks(buildDetails({ offset: 10 }), 100);

    expect(offsetOf(links.self.href)).toBe("10");
    expect(offsetOf(links.next.href)).toBe("20");
    expect(offsetOf(links.prev.href)).toBe("0");
    expect(offsetOf(links.first.href)).toBe("0");
    expect(offsetOf(links.last.href)).toBe("90");
  });

  it("omits next on the last page and prev on the first page", () => {
    const first = getPaginationLinks(buildDetails({ offset: 0 }), 100);
    expect(first.prev.href).toBeUndefined();
    expect(first.next.href).toBeDefined();

    const last = getPaginationLinks(buildDetails({ offset: 90 }), 100);
    expect(last.next.href).toBeUndefined();
    expect(last.prev.href).toBeDefined();
  });

  it("points last to offset 0 when there is no data", () => {
    const links = getPaginationLinks(buildDetails(), 0);

    expect(offsetOf(links.last.href)).toBe("0");
    expect(links.pages).toEqual({});
  });

  it("returns no page links when everything fits one batch", () => {
    const links = getPaginationLinks(buildDetails(), 5);

    expect(links.pages).toEqual({});
  });

  it("returns a link per page when there are at most 5 batches", () => {
    const links = getPaginationLinks(buildDetails(), 45);

    expect(Object.keys(links.pages)).toEqual(["1", "2", "3", "4", "5"]);
    expect(links.pages[3].href).toContain("offset=20");
  });

  it("returns first, last and leading neighbours when on the first of many batches", () => {
    const links = getPaginationLinks(buildDetails({ offset: 0 }), 100);

    expect(Object.keys(links.pages)).toEqual(["1", "2", "3", "10"]);
  });

  it("returns first, last and trailing neighbours when on the last of many batches", () => {
    const links = getPaginationLinks(buildDetails({ offset: 90 }), 100);

    expect(Object.keys(links.pages)).toEqual(["1", "8", "9", "10"]);
    expect(offsetOf(links.pages[8].href)).toBe("70");
    expect(offsetOf(links.pages[9].href)).toBe("80");
  });

  it("returns first, last and both neighbours when on a middle batch", () => {
    const links = getPaginationLinks(buildDetails({ offset: 50 }), 100);

    expect(Object.keys(links.pages)).toEqual(["1", "5", "6", "7", "10"]);
    expect(offsetOf(links.pages[5].href)).toBe("40");
    expect(offsetOf(links.pages[7].href)).toBe("60");
  });
});

describe("formatAPIResponse", () => {
  const savedHostUrl = process.env.HOST_URL;

  beforeAll(() => {
    process.env.HOST_URL = "https://example.com";
  });

  afterAll(() => {
    process.env.HOST_URL = savedHostUrl;
  });

  it("returns data without metadata when no pagination info is supplied", () => {
    const response = formatAPIResponse({ data: [1, 2], totalCount: 2 });

    expect(response).toEqual({ data: [1, 2] });
  });

  it("builds metadata from explicit pagination details", () => {
    const response = formatAPIResponse({
      data: ["a"],
      totalCount: 100,
      pagination: buildDetails({ offset: 10 }),
    });

    expect(response.metadata?.totalCount).toBe(100);
    expect(offsetOf(response.metadata?.links?.self.href)).toBe("10");
  });

  it("builds metadata from the request url, stripping limit and offset params", () => {
    const request = {
      originalUrl: "/api/v1/messages?limit=5&offset=10&status=delivered",
    } as FastifyRequest;

    const response = formatAPIResponse({
      data: ["a"],
      totalCount: 100,
      request,
    });

    const self = new URL(response.metadata?.links?.self.href as string);
    expect(self.searchParams.get("limit")).toBe("5");
    expect(self.searchParams.get("offset")).toBe("10");
    expect(self.searchParams.get("status")).toBe("delivered");
  });

  it("falls back to default pagination when the request url has no params", () => {
    const request = { originalUrl: "/api/v1/messages" } as FastifyRequest;

    const response = formatAPIResponse({
      data: ["a"],
      totalCount: 1,
      request,
    });

    const self = new URL(response.metadata?.links?.self.href as string);
    expect(self.searchParams.get("limit")).toBe(
      PAGINATION_LIMIT_DEFAULT.toString(),
    );
    expect(self.searchParams.get("offset")).toBe("0");
  });
});

describe("sanitizePagination", () => {
  it("keeps values inside the allowed range", () => {
    expect(sanitizePagination({ limit: "10", offset: "5" })).toEqual({
      limit: "10",
      offset: "5",
    });
  });

  it("accepts the maximum limit", () => {
    expect(
      sanitizePagination({
        limit: PAGINATION_MAX_LIMIT.toString(),
        offset: "0",
      }),
    ).toEqual({
      limit: PAGINATION_MAX_LIMIT.toString(),
      offset: "0",
    });
  });

  it("rejects a limit outside the allowed range", () => {
    expect(() => sanitizePagination({ limit: "99999", offset: "0" })).toThrow(
      expect.objectContaining({
        statusCode: 422,
        message: `Limit must be between ${PAGINATION_MIN_LIMIT} and ${PAGINATION_MAX_LIMIT}`,
      }),
    );
    expect(() => sanitizePagination({ limit: "-5", offset: "0" })).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it("rejects an offset below the minimum", () => {
    expect(() => sanitizePagination({ limit: "10", offset: "-10" })).toThrow(
      expect.objectContaining({
        statusCode: 422,
        message: `Offset must be greater than or equal to ${PAGINATION_MIN_OFFSET}`,
      }),
    );
  });

  it("uses defaults for invalid numbers", () => {
    expect(sanitizePagination({ limit: "invalid", offset: "invalid" })).toEqual(
      {
        limit: PAGINATION_LIMIT_DEFAULT.toString(),
        offset: PAGINATION_OFFSET_DEFAULT.toString(),
      },
    );
  });
});
