import { describe, expect, it } from "vitest";
import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MIN_PER_PAGE,
  resolvePagination,
  toDataResponse,
  toIsoString,
  toPaginatedResponse,
} from "../src/conventions.js";

describe("resolvePagination", () => {
  it("defaults to DEFAULT_PER_PAGE and offset 0 for empty input", () => {
    expect(resolvePagination()).toEqual({ limit: DEFAULT_PER_PAGE, offset: 0 });
    expect(resolvePagination({})).toEqual({
      limit: DEFAULT_PER_PAGE,
      offset: 0,
    });
  });

  it("clamps perPage into [MIN_PER_PAGE, MAX_PER_PAGE]", () => {
    expect(resolvePagination({ perPage: 200 }).limit).toBe(MAX_PER_PAGE);
    expect(resolvePagination({ perPage: 0 }).limit).toBe(MIN_PER_PAGE);
    expect(resolvePagination({ perPage: 50 }).limit).toBe(50);
  });

  it("floors a negative explicit offset at 0", () => {
    expect(resolvePagination({ offset: -5 }).offset).toBe(0);
  });

  it("derives offset from a 1-based page number", () => {
    expect(resolvePagination({ page: 3, perPage: 10 })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it("prefers an explicit offset over page", () => {
    expect(resolvePagination({ page: 3, perPage: 10, offset: 5 })).toEqual({
      limit: 10,
      offset: 5,
    });
  });

  it("computes the page offset against the clamped limit", () => {
    // perPage 200 clamps to 100, so page 2 starts at offset 100 (not 200).
    expect(resolvePagination({ page: 2, perPage: 200 })).toEqual({
      limit: MAX_PER_PAGE,
      offset: MAX_PER_PAGE,
    });
  });
});

describe("toIsoString", () => {
  it("returns null for nullish input", () => {
    expect(toIsoString(null)).toBeNull();
    expect(toIsoString(undefined)).toBeNull();
  });

  it("formats a Date as ISO-8601", () => {
    const date = new Date("2024-08-27T07:46:10.290Z");
    expect(toIsoString(date)).toBe("2024-08-27T07:46:10.290Z");
  });

  it("parses a string into ISO-8601", () => {
    expect(toIsoString("2024-08-27T07:46:10.290Z")).toBe(
      "2024-08-27T07:46:10.290Z",
    );
  });
});

describe("toPaginatedResponse", () => {
  it("wraps rows and total without links", () => {
    expect(toPaginatedResponse({ data: [1, 2], total: 5 })).toEqual({
      data: [1, 2],
      metadata: { totalCount: 5 },
    });
  });

  it("attaches links to metadata when provided", () => {
    const links = { next: { href: "/next" } };
    expect(toPaginatedResponse({ data: [], total: 0 }, links)).toEqual({
      data: [],
      metadata: { totalCount: 0, links },
    });
  });
});

describe("toDataResponse", () => {
  it("wraps a single entity in the envelope", () => {
    expect(toDataResponse({ id: "x" })).toEqual({ data: { id: "x" } });
  });
});
