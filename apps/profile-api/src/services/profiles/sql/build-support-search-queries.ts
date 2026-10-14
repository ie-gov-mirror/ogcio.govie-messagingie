import type { PaginationParams } from "~/schemas/pagination.js";
import type { SupportSearchBody } from "~/schemas/profiles/support.js";

type QueryWithValues = {
  query: string;
  values: (string | number)[];
};

const buildClauses = (
  body: SupportSearchBody,
): { clauses: string[]; values: (string | number)[]; nextIndex: number } => {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  for (const nameVal of body.name ?? []) {
    const trimmed = nameVal.trim();
    if (trimmed.length === 0) continue;
    clauses.push(
      `(
        p.public_name ILIKE $${idx}
        OR EXISTS (
          SELECT 1
          FROM profile_data fn
          INNER JOIN profile_data ln
            ON ln.profile_details_id = fn.profile_details_id
            AND ln.name = 'lastName'
          WHERE fn.profile_details_id = pd.id
            AND fn.name = 'firstName'
            AND (
              CONCAT(fn.value, ' ', ln.value) ILIKE $${idx}
              OR CONCAT(ln.value, ' ', fn.value) ILIKE $${idx}
            )
        )
      )`,
    );
    values.push(`%${trimmed}%`);
    idx++;
  }

  for (const emailVal of body.email ?? []) {
    const trimmed = emailVal.trim();
    if (trimmed.length === 0) continue;
    clauses.push(
      `EXISTS (
        SELECT 1 FROM profile_data pde
        WHERE pde.profile_details_id = pd.id
          AND pde.name = 'email'
          AND pde.value ILIKE $${idx}
      )`,
    );
    values.push(`%${trimmed}%`);
    idx++;
  }

  for (const ppsnVal of body.ppsn ?? []) {
    const trimmed = ppsnVal.trim();
    if (trimmed.length === 0) continue;
    clauses.push(
      `EXISTS (
        SELECT 1 FROM profile_data pde
        WHERE pde.profile_details_id = pd.id
          AND pde.name = 'ppsn'
          AND pde.value ILIKE $${idx}
      )`,
    );
    values.push(`%${trimmed}%`);
    idx++;
  }

  for (const dobRange of body.dateOfBirth ?? []) {
    const subClauses: string[] = [];
    if (dobRange.from) {
      subClauses.push(`pde.value >= $${idx}`);
      values.push(dobRange.from);
      idx++;
    }
    if (dobRange.to) {
      subClauses.push(`pde.value <= $${idx}`);
      values.push(dobRange.to);
      idx++;
    }
    if (subClauses.length === 0) continue;
    clauses.push(
      `EXISTS (
        SELECT 1 FROM profile_data pde
        WHERE pde.profile_details_id = pd.id
          AND pde.name = 'dateOfBirth'
          AND ${subClauses.join(" AND ")}
      )`,
    );
  }

  for (const idVal of body.id ?? []) {
    const trimmed = idVal.trim();
    if (trimmed.length === 0) continue;
    clauses.push(`(p.id = $${idx} OR p.primary_user_id = $${idx})`);
    values.push(trimmed);
    idx++;
  }

  return { clauses, values, nextIndex: idx };
};

export const buildSupportSearchQueries = (params: {
  body: SupportSearchBody;
  pagination: Required<PaginationParams>;
}): { count: QueryWithValues; data: QueryWithValues } => {
  const { body, pagination } = params;
  const operator = body.logicalOperator ?? "and";
  const { clauses, values, nextIndex } = buildClauses(body);

  const whereClause =
    clauses.length > 0
      ? `AND (${clauses.join(` ${operator.toUpperCase()} `)})`
      : "";

  const baseFrom = `
    FROM profiles p
    INNER JOIN profile_details pd
      ON pd.profile_id = p.id
      AND pd.is_latest = true
    WHERE 1 = 1
    ${whereClause}
  `;

  const offsetNum = Number(pagination.offset);
  const limitNum = Number(pagination.limit);

  return {
    count: {
      query: `SELECT COUNT(DISTINCT p.id) as count ${baseFrom}`,
      values,
    },
    data: {
      query: `
        SELECT * FROM (
          SELECT
            p.id,
            p.public_name AS "publicName",
            pd.organisation_id AS "organisationId",
            pd.id AS "profileDetailsId",
            p.primary_user_id as "primaryUserId",
            p.created_at as "createdAt",
            p.updated_at as "updatedAt",
            p.deleted_at as "deletedAt",
            p.status,
            p.preferred_language as "preferredLanguage",
            p.safe_level as "safeLevel",
            -- Cast the JSONB consent_statuses to text so the shared Kysely
            -- CamelCasePlugin does not rewrite nested keys (e.g. the legacy
            -- consent_statement_id); the model re-parses it with JSON.parse.
            p.consent_statuses::text as "consentStatuses",
            DENSE_RANK() OVER (ORDER BY p.created_at DESC, p.id) AS dr
          ${baseFrom}
        ) sub
        WHERE sub.dr > $${nextIndex} AND sub.dr <= $${nextIndex + 1}
        ORDER BY sub.dr, sub."organisationId" NULLS FIRST
      `,
      values: [...values, offsetNum, offsetNum + limitNum],
    },
  };
};
