import { randomUUID } from "node:crypto";

/**
 * Pagination request parameters, using limit/offset semantics matching the
 * existing OGCIO API pagination convention.
 */
export interface PaginationInput {
  /** 1-based page number. Ignored when {@link PaginationInput.offset} is set. */
  page?: number;
  /** Maximum number of rows to return. */
  perPage?: number;
  /** Number of rows to skip. Takes precedence over {@link PaginationInput.page}. */
  offset?: number;
}

/**
 * Result of a paginated query: the page of rows plus the total row count of the
 * unpaginated query (typically obtained via `COUNT(*) OVER()`).
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

/**
 * Metadata block appended to list responses, matching the shape produced by the
 * existing `formatAPIResponse` helper in the APIs.
 */
export interface ResponseMetadata {
  totalCount?: number;
  links?: Record<string, unknown>;
}

/**
 * The canonical single/list response envelope used by the OGCIO APIs.
 * Mirrors `GenericResponse<T>` in the messaging/profile APIs.
 */
export interface GenericResponse<T> {
  data: T;
  metadata?: ResponseMetadata;
}

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;
export const MIN_PER_PAGE = 1;

/**
 * Normalize {@link PaginationInput} into concrete `limit`/`offset` values,
 * clamping `perPage` into the accepted range.
 */
export const resolvePagination = (
  input: PaginationInput = {},
): { limit: number; offset: number } => {
  const limit = Math.min(
    MAX_PER_PAGE,
    Math.max(MIN_PER_PAGE, input.perPage ?? DEFAULT_PER_PAGE),
  );
  const offset =
    input.offset !== undefined
      ? Math.max(0, input.offset)
      : Math.max(0, ((input.page ?? 1) - 1) * limit);
  return { limit, offset };
};

/**
 * Wrap a {@link PaginatedResult} in a {@link GenericResponse} envelope. Optional
 * pre-built pagination links are attached to `metadata.links`.
 */
export const toPaginatedResponse = <T>(
  result: PaginatedResult<T>,
  links?: Record<string, unknown>,
): GenericResponse<T[]> => ({
  data: result.data,
  metadata: links
    ? { totalCount: result.total, links }
    : { totalCount: result.total },
});

/** Wrap a single entity in the {@link GenericResponse} envelope. */
export const toDataResponse = <T>(data: T): GenericResponse<T> => ({ data });

/** Generate a new v4 UUID for use as a primary key. */
export const newId = (): string => randomUUID();

/** Current timestamp as an ISO-8601 string. */
export const nowIso = (): string => new Date().toISOString();

/**
 * Coerce a value that may be a `Date` (as returned by node-postgres for
 * `timestamptz` columns) or a string into an ISO-8601 string. Returns `null`
 * for nullish input.
 */
export const toIsoString = (
  value: Date | string | null | undefined,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
};
