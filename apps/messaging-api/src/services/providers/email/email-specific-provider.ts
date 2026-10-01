import { httpErrors } from "@fastify/sensible";
import type { Logger } from "@ogcio/building-blocks-sdk/dist/types/index.js";
import type { Pool, PoolClient } from "pg";
import type { EnvConfig } from "../../../plugins/external/env.js";
import type {
  EditableProviderTypes,
  EmailCreateBody,
  EmailProvider,
  NoPasswordEmailProvider,
  ProvidersList,
  ProvidersListItem,
  ProviderUpdateBody,
} from "../../../types/providers.js";
import type { PaginationParams } from "../../../types/schemaDefinitions.js";
import type CryptographyService from "../../../utils/cryptography-service.js";

const FAILED_TO_FIND = "failed to find email provider";

export class EmailSpecificProvider {
  readonly providerType: EditableProviderTypes;
  constructor(
    readonly pool: Pool,
    readonly organisationId: string,
    readonly cryptographyService: CryptographyService,
    readonly config?: EnvConfig,
    readonly logger?: Logger,
  ) {
    this.providerType = "email";
  }

  async get<T extends EmailProvider>(params: {
    providerId: string;
    includePassword?: true;
  }): Promise<T>;
  async get<T extends NoPasswordEmailProvider>(params: {
    providerId: string;
    includePassword: false;
  }): Promise<T>;
  async get<T extends EmailProvider | NoPasswordEmailProvider>(params: {
    providerId: string;
    includePassword?: boolean;
  }): Promise<T> {
    let provider: EmailProvider | NoPasswordEmailProvider | undefined;
    let passwordSelect = "";

    const includePassword = params.includePassword !== false;
    if (includePassword) {
      passwordSelect = "pw as password,";
    }

    try {
      const queryResult = await this.pool.query<T>(
        `
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
          WHERE organisation_id = $1 AND id = $2
          AND deleted_at is null
          ORDER BY provider_name`,
        [this.organisationId, params.providerId],
      );

      provider = queryResult.rows.at(0);
    } catch (error) {
      throw httpErrors.createError(500, "failed to query email provider", {
        parent: error,
      });
    }

    if (!provider) {
      throw httpErrors.notFound(FAILED_TO_FIND);
    }

    if (
      includePassword &&
      "password" in provider &&
      provider.password &&
      provider.password.length > 0
    ) {
      provider.password = this.cryptographyService.decrypt(provider.password);
    }

    return provider as T;
  }

  getDefault(): EmailProvider {
    if (!this.config) {
      throw httpErrors.internalServerError(
        "No config found for default email provider",
      );
    }
    const headers = this.config.EMAIL_PROVIDER_SMTP_TENANT_NAME
      ? {
          "X-SES-TENANT": this.config.EMAIL_PROVIDER_SMTP_TENANT_NAME,
        }
      : null;

    return {
      id: "default",
      providerName: "Gov.ie Secure Messaging",
      isPrimary: true,
      smtpHost: this.config.EMAIL_PROVIDER_SMTP_HOST,
      smtpPort: this.config.EMAIL_PROVIDER_SMTP_PORT,
      username: this.config.EMAIL_PROVIDER_SMTP_USERNAME,
      password: this.config.EMAIL_PROVIDER_SMTP_PASSWORD,
      fromAddress: this.config.EMAIL_PROVIDER_SMTP_FROM_ADDRESS,
      ssl: this.config.EMAIL_PROVIDER_SMTP_USE_SSL,
      throttle: 1,
      type: "email",
      headers,
    };
  }

  async getPrimaryOrDefault(): Promise<EmailProvider> {
    let provider: EmailProvider | undefined;
    try {
      const queryResult = await this.pool.query<EmailProvider>(
        `
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
          WHERE organisation_id = $1 AND is_primary = true
          AND deleted_at is null
          ORDER BY provider_name
          LIMIT 1
        `,
        [this.organisationId],
      );

      provider = queryResult.rows.at(0);
    } catch (error) {
      throw httpErrors.createError(
        500,
        "failed to query primary email provider",
        {
          parent: error,
        },
      );
    }

    // If no primary provider is found, return the default provider
    if (!provider) {
      return this.getDefault();
    }

    if (provider.password && provider.password.length > 0) {
      provider.password = this.cryptographyService.decrypt(provider.password);
    }

    return provider;
  }

  async delete(params: { providerId: string }): Promise<void> {
    let deleted = 0;
    try {
      const provider = await this.get({
        providerId: params.providerId,
        includePassword: false,
      });
      // We are prefixing and not suffixing as we do in templates
      // because fromAddress should be a valid email address
      // and we want to avoid any validation error in other points of the system
      const prefixDeleted = (toUpdate: string) =>
        `deleted-${Date.now()}-${toUpdate}`;
      const name = prefixDeleted(provider.providerName);
      const fromAddress = prefixDeleted(provider.fromAddress);

      const deleteQueryResult = await this.pool.query(
        `
          UPDATE email_providers 
          SET deleted_at = now(), provider_name = $3, from_address = $4
          WHERE id = $1 AND organisation_id = $2
          RETURNING 1`,
        [params.providerId, this.organisationId, name, fromAddress],
      );

      deleted = deleteQueryResult.rowCount || 0;
    } catch (error) {
      throw httpErrors.createError(500, "failed delete query", {
        parent: error,
      });
    }

    if (deleted === 0) {
      throw httpErrors.notFound(FAILED_TO_FIND);
    }
  }

  async create(params: { inputBody: EmailCreateBody }): Promise<string> {
    const { inputBody } = params;
    await this.ensureSameNameProviderDoesntExist({
      inputBody,
      organisationId: this.organisationId,
    });

    const client = await this.pool.connect();
    try {
      client.query("BEGIN");

      const isPrimary = await this.needToSetProviderAsPrimary({
        client,
        organisationId: this.organisationId,
        setAsPrimary: inputBody.isPrimary,
        tableName: "email_providers",
      });

      if (isPrimary) {
        await client.query(
          `
            UPDATE email_providers
            SET is_primary = null
            WHERE organisation_id = $1
          `,
          [this.organisationId],
        );
      }

      const queryResult = await client.query<{ providerId: string }>(
        `
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
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id as "providerId"`,
        [
          inputBody.providerName,
          inputBody.smtpHost,
          inputBody.smtpPort,
          inputBody.username,
          // Encrypt password before storing it
          this.cryptographyService.encrypt(inputBody.password),
          inputBody.fromAddress,
          inputBody.throttle,
          inputBody.ssl,
          this.organisationId,
          isPrimary,
          inputBody.headers ?? null,
        ],
      );

      const providerId = queryResult.rows.at(0)?.providerId;
      if (!providerId) {
        throw httpErrors.internalServerError("no record has been inserted");
      }

      await client.query("COMMIT");

      return providerId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw httpErrors.createError(500, "failed to insert email provider", {
        parent: error,
      });
    } finally {
      client.release();
    }
  }

  async update(params: { inputBody: ProviderUpdateBody }): Promise<void> {
    const { inputBody } = params;
    // check if provider exists
    await this.get({
      providerId: inputBody.id,
    });

    await this.ensureSameNameProviderDoesntExist({
      inputBody,
      organisationId: this.organisationId,
      providerIdToIgnore: params.inputBody.id,
    });

    const client = await this.pool.connect();
    let updatedCount = 0;
    try {
      client.query("BEGIN");
      const isPrimary = await this.needToSetProviderAsPrimary({
        client,
        organisationId: this.organisationId,
        setAsPrimary: inputBody.isPrimary,
        providerIdToIgnore: inputBody.id,
        tableName: "email_providers",
      });
      if (isPrimary) {
        await client.query(
          `
            UPDATE email_providers SET is_primary = null
            WHERE organisation_id = $1
          `,
          [this.organisationId],
        );
      }

      const values = [
        inputBody.providerName,
        inputBody.smtpHost,
        inputBody.smtpPort,
        inputBody.username,
        inputBody.fromAddress,
        inputBody.throttle,
        inputBody.ssl,
        isPrimary,
        inputBody.id,
        this.organisationId,
        inputBody.headers ?? null,
      ];
      let passwordInsert = "";
      if (inputBody.password && inputBody.password.length > 0) {
        // Encrypt password before storing it
        values.push(this.cryptographyService.encrypt(inputBody.password));
        passwordInsert = `, pw = $12`;
      }

      const updateResult = await client.query(
        `
          UPDATE email_providers SET 
            provider_name = $1, 
            smtp_host = $2,
            smtp_port = $3,
            username = $4,
            from_address = $5,
            throttle_ms = $6,
            is_ssl = $7,
            is_primary = $8,
            headers = $11
            ${passwordInsert}
          WHERE id = $9 AND organisation_id = $10
          RETURNING 1
        `,
        values,
      );
      updatedCount = updateResult.rowCount || 0;
      client.query("COMMIT");
    } catch (error) {
      client.query("ROLLBACK");
      throw httpErrors.createError(500, "failed to update email provider", {
        parent: error,
      });
    } finally {
      client.release();
    }

    if (!updatedCount) {
      throw httpErrors.notFound(FAILED_TO_FIND);
    }
  }

  async list(params: {
    isPrimary: boolean | undefined;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: ProvidersList; totalCount: number }> {
    let isPrimaryWhereClause = "";
    if (params.isPrimary !== undefined) {
      isPrimaryWhereClause = params.isPrimary
        ? "AND is_primary = true"
        : "AND (is_primary = false OR is_primary IS NULL)";
    }
    try {
      // separated count result query because using CTE
      // no result is returned if the requested offset is
      // higher than the total count
      const countResult = await this.pool.query<{ count: number }>(
        `
SELECT count(*) FROM email_providers
WHERE organisation_id = $1
AND deleted_at is null
${isPrimaryWhereClause}`,
        [this.organisationId],
      );
      if (countResult.rowCount === 0 || countResult.rows[0].count === 0) {
        return { data: [], totalCount: 0 };
      }
      const result = await this.pool.query<ProvidersListItem>(
        `
          SELECT
            id,
            provider_name as "providerName",
            is_primary as "isPrimary",
            'email' as "type"
          FROM email_providers
          WHERE organisation_id = $1
          AND deleted_at is null 
          ${isPrimaryWhereClause}
          ORDER BY provider_name
          LIMIT $2
          OFFSET $3`,
        [
          this.organisationId,
          params.pagination.limit,
          params.pagination.offset,
        ],
      );

      return {
        data: result.rows,
        totalCount: Number(countResult.rows[0].count),
      };
    } catch (error) {
      throw httpErrors.createError(500, "failed to query email providers", {
        parent: error,
      });
    }
  }

  private async ensureSameNameProviderDoesntExist(params: {
    inputBody: { fromAddress: string; providerName: string };
    organisationId: string;
    providerIdToIgnore?: string;
  }): Promise<void> {
    const values: string[] = [
      params.organisationId,
      params.inputBody.fromAddress,
      params.inputBody.providerName,
    ];
    let templateIdToIgnoreWhere = "";
    if (params.providerIdToIgnore) {
      templateIdToIgnoreWhere = " AND id != $4 ";
      values.push(params.providerIdToIgnore);
    }

    const duplicationQueryResult = await this.pool.query<{
      exists: boolean;
    }>(
      `
        SELECT exists(
          SELECT * from email_providers
          WHERE organisation_id = $1 
          AND (lower(from_address) = lower($2) OR lower(provider_name) = lower($3))
          ${templateIdToIgnoreWhere}
        )`,
      values,
    );

    const addressExists = Boolean(duplicationQueryResult.rows.at(0)?.exists);

    if (addressExists) {
      throw httpErrors.createError(
        422,
        "provider from address or name already exists",
        {
          validation: [
            {
              fieldName: "fromAddress",
              message: "alreadyInUse",
              validationRule: "already-in-use",
            },
          ],
        },
      );
    }
  }

  private async needToSetProviderAsPrimary(params: {
    client: PoolClient;
    organisationId: string;
    providerIdToIgnore?: string;
    setAsPrimary: boolean | null;
    tableName: "email_providers";
  }): Promise<boolean | null> {
    if (params.setAsPrimary) {
      return true;
    }
    const values = [params.organisationId];
    let idWhereClause = "";
    if (params.providerIdToIgnore) {
      idWhereClause = " AND id != $2";
      values.push(params.providerIdToIgnore);
    }
    const otherProviders = await params.client.query<{ id: string }>(
      `
        SELECT id FROM ${params.tableName}
        WHERE organisation_id = $1
        AND deleted_at is null
        ${idWhereClause}
        LIMIT 1`,
      values,
    );

    return otherProviders.rowCount === 0 || null;
  }
}
