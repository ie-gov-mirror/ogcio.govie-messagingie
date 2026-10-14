import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type {
  EmailProvider,
  NoPasswordEmailProvider,
  ProvidersListItem,
} from "../types/providers.js";

/**
 * Data-access model for the `email_providers` domain. Extends {@link BaseModel}
 * for generic CRUD and ports the bespoke provider reads/writes (with computed
 * columns, primary-provider bookkeeping and soft-delete) previously living in
 * `EmailSpecificProvider`.
 *
 * The exact projected column shapes (`COALESCE`, `'email' as type`, conditional
 * password selection) must be preserved byte-for-byte for API parity, so these
 * finders drop to the exported `sql` template rather than the query builder.
 * Password encryption/decryption stays in the service layer; the model only
 * moves already-encrypted values in and raw rows out.
 */
export class ProviderModel extends BaseModel<DB, "emailProviders"> {
  constructor(db: Kysely<DB>) {
    super(db, "emailProviders");
  }

  /** Fetch a single provider, optionally including the (encrypted) password. */
  async getRow(params: {
    providerId: string;
    organisationId: string;
    includePassword: boolean;
  }): Promise<EmailProvider | NoPasswordEmailProvider | undefined> {
    const passwordSelect = params.includePassword
      ? sql`pw as password,`
      : sql``;

    const { rows } = await sql<EmailProvider | NoPasswordEmailProvider>`
          SELECT id,
              'email' as "type",
              provider_name as "providerName",
              COALESCE(is_primary, false) as "isPrimary",
              smtp_host as "smtpHost",
              smtp_port as "smtpPort",
              username,
              ${passwordSelect}
              COALESCE(throttle_ms, 0) as "throttle",
              from_address as "fromAddress",
              is_ssl as "ssl",
              headers
          FROM email_providers
          WHERE organisation_id = ${params.organisationId} AND id = ${params.providerId}
          AND deleted_at is null
          ORDER BY provider_name`.execute(this.db);

    return rows.at(0);
  }

  /** Fetch the organisation's primary provider (with encrypted password). */
  async getPrimaryRow(
    organisationId: string,
  ): Promise<EmailProvider | undefined> {
    const { rows } = await sql<EmailProvider>`
          SELECT id,
            'email' as "type",
            provider_name as "providerName",
            is_primary as "isPrimary",
            smtp_host as "smtpHost",
            smtp_port as "smtpPort",
            username,
            pw as "password",
            COALESCE(throttle_ms, 0) as "throttle",
            from_address as "fromAddress",
            is_ssl as "ssl",
            headers
          FROM email_providers
          WHERE organisation_id = ${organisationId} AND is_primary = true
          AND deleted_at is null
          ORDER BY provider_name
          LIMIT 1
        `.execute(this.db);

    return rows.at(0);
  }

  /** Count providers for an organisation, optionally filtered by primary flag. */
  async countRows(params: {
    organisationId: string;
    isPrimary: boolean | undefined;
  }): Promise<number> {
    const { rows } = await sql<{ count: number }>`
SELECT count(*) FROM email_providers
WHERE organisation_id = ${params.organisationId}
AND deleted_at is null
${this.isPrimaryClause(params.isPrimary)}`.execute(this.db);

    return Number(rows.at(0)?.count ?? 0);
  }

  /** Paginated provider list items for an organisation. */
  async listRows(params: {
    organisationId: string;
    isPrimary: boolean | undefined;
    limit: string | number;
    offset: string | number;
  }): Promise<ProvidersListItem[]> {
    const { rows } = await sql<ProvidersListItem>`
          SELECT
            id,
            provider_name as "providerName",
            is_primary as "isPrimary",
            'email' as "type"
          FROM email_providers
          WHERE organisation_id = ${params.organisationId}
          AND deleted_at is null 
          ${this.isPrimaryClause(params.isPrimary)}
          ORDER BY provider_name
          LIMIT ${params.limit}
          OFFSET ${params.offset}`.execute(this.db);

    return rows;
  }

  /** Whether a provider with the same from-address or name already exists. */
  async existsByNameOrAddress(params: {
    organisationId: string;
    fromAddress: string;
    providerName: string;
    providerIdToIgnore?: string;
  }): Promise<boolean> {
    const ignoreFilter = params.providerIdToIgnore
      ? sql` AND id != ${params.providerIdToIgnore} `
      : sql``;

    const { rows } = await sql<{ exists: boolean }>`
        SELECT exists(
          SELECT * from email_providers
          WHERE organisation_id = ${params.organisationId} 
          AND (lower(from_address) = lower(${params.fromAddress}) OR lower(provider_name) = lower(${params.providerName}))
          ${ignoreFilter}
        )`.execute(this.db);

    return Boolean(rows.at(0)?.exists);
  }

  /**
   * Insert a provider (with an already-encrypted password) inside a transaction
   * that also maintains the single-primary-per-organisation invariant.
   */
  async createProvider(params: {
    organisationId: string;
    encryptedPassword: string;
    inputBody: {
      providerName: string;
      smtpHost: string;
      smtpPort: number;
      username: string;
      fromAddress: string;
      throttle?: number;
      ssl: boolean;
      isPrimary: boolean;
      headers?: unknown;
    };
  }): Promise<string> {
    const { organisationId, encryptedPassword, inputBody } = params;

    return this.db.transaction().execute(async (trx) => {
      const isPrimary = await this.resolvePrimary(trx, {
        organisationId,
        setAsPrimary: inputBody.isPrimary,
      });

      if (isPrimary) {
        await this.clearPrimary(trx, organisationId);
      }

      const { rows } = await sql<{ providerId: string }>`
          INSERT INTO email_providers(
            provider_name,
            smtp_host,
            smtp_port,
            username,
            pw,
            from_address,
            throttle_ms,
            is_ssl,
            organisation_id,
            is_primary,
            headers
          )
          VALUES(${inputBody.providerName}, ${inputBody.smtpHost}, ${inputBody.smtpPort}, ${inputBody.username}, ${encryptedPassword}, ${inputBody.fromAddress}, ${inputBody.throttle ?? null}, ${inputBody.ssl}, ${organisationId}, ${isPrimary}, ${inputBody.headers ?? null})
          RETURNING id as "providerId"`.execute(trx);

      const providerId = rows.at(0)?.providerId;
      if (!providerId) {
        throw new Error("no record has been inserted");
      }

      return providerId;
    });
  }

  /**
   * Update a provider inside a transaction, maintaining the primary invariant.
   * When `encryptedPassword` is omitted the existing password is preserved.
   * Returns the number of affected rows.
   */
  async updateProvider(params: {
    organisationId: string;
    providerId: string;
    encryptedPassword?: string;
    inputBody: {
      providerName: string;
      smtpHost: string;
      smtpPort: number;
      username: string;
      fromAddress: string;
      throttle?: number;
      ssl: boolean;
      isPrimary: boolean | null;
      headers?: unknown;
    };
  }): Promise<number> {
    const { organisationId, providerId, encryptedPassword, inputBody } = params;

    return this.db.transaction().execute(async (trx) => {
      const isPrimary = await this.resolvePrimary(trx, {
        organisationId,
        setAsPrimary: inputBody.isPrimary,
        providerIdToIgnore: providerId,
      });
      if (isPrimary) {
        await this.clearPrimary(trx, organisationId);
      }

      const passwordSet =
        encryptedPassword !== undefined
          ? sql`, pw = ${encryptedPassword}`
          : sql``;

      const { numAffectedRows } = await sql`
          UPDATE email_providers SET 
            provider_name = ${inputBody.providerName}, 
            smtp_host = ${inputBody.smtpHost},
            smtp_port = ${inputBody.smtpPort},
            username = ${inputBody.username},
            from_address = ${inputBody.fromAddress},
            throttle_ms = ${inputBody.throttle ?? null},
            is_ssl = ${inputBody.ssl},
            is_primary = ${isPrimary},
            headers = ${inputBody.headers ?? null}
            ${passwordSet}
          WHERE id = ${providerId} AND organisation_id = ${organisationId}
        `.execute(trx);

      return Number(numAffectedRows ?? 0);
    });
  }

  /** Soft-delete a provider by renaming and stamping `deleted_at`. */
  async softDeleteProvider(params: {
    providerId: string;
    organisationId: string;
    providerName: string;
    fromAddress: string;
  }): Promise<number> {
    const { numAffectedRows } = await sql`
          UPDATE email_providers 
          SET deleted_at = now(), provider_name = ${params.providerName}, from_address = ${params.fromAddress}
          WHERE id = ${params.providerId} AND organisation_id = ${params.organisationId}`.execute(
      this.db,
    );

    return Number(numAffectedRows ?? 0);
  }

  private isPrimaryClause(isPrimary: boolean | undefined) {
    if (isPrimary === undefined) {
      return sql``;
    }
    return isPrimary
      ? sql`AND is_primary = true`
      : sql`AND (is_primary = false OR is_primary IS NULL)`;
  }

  private async clearPrimary(
    trx: Kysely<DB>,
    organisationId: string,
  ): Promise<void> {
    await sql`
            UPDATE email_providers
            SET is_primary = null
            WHERE organisation_id = ${organisationId}
          `.execute(trx);
  }

  /**
   * Decide the `is_primary` value for a create/update. Explicit primary wins;
   * otherwise a provider becomes primary only when it is the organisation's
   * first (returns `true`), else `null` (mirroring the previous logic).
   */
  private async resolvePrimary(
    trx: Kysely<DB>,
    params: {
      organisationId: string;
      setAsPrimary: boolean | null;
      providerIdToIgnore?: string;
    },
  ): Promise<boolean | null> {
    if (params.setAsPrimary) {
      return true;
    }
    const idFilter = params.providerIdToIgnore
      ? sql` AND id != ${params.providerIdToIgnore}`
      : sql``;

    const { rows } = await sql<{ id: string }>`
        SELECT id FROM email_providers
        WHERE organisation_id = ${params.organisationId}
        AND deleted_at is null
        ${idFilter}
        LIMIT 1`.execute(trx);

    return rows.length === 0 || null;
  }
}
