import { httpErrors } from "@fastify/sensible";
import type { Logger } from "@ogcio/building-blocks-sdk/dist/types/index.js";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../../../db/schema.js";
import { ProviderModel } from "../../../models/provider-model.js";
import type { EnvConfig } from "../../../plugins/external/env.js";
import type {
  EditableProviderTypes,
  EmailCreateBody,
  EmailProvider,
  NoPasswordEmailProvider,
  ProvidersList,
  ProviderUpdateBody,
} from "../../../types/providers.js";
import type { PaginationParams } from "../../../types/schemaDefinitions.js";
import type CryptographyService from "../../../utils/cryptography-service.js";

const FAILED_TO_FIND = "failed to find email provider";

/**
 * Business logic for the email provider domain. Composes {@link ProviderModel}
 * for data access and owns the cross-cutting concerns (password
 * encryption/decryption, default-provider fallback, primary bookkeeping error
 * mapping). This is the class that thin controllers instantiate with `app.db`.
 */
export class EmailProviderService {
  readonly providerType: EditableProviderTypes = "email";
  protected readonly model: ProviderModel;

  constructor(
    db: Kysely<DB>,
    readonly organisationId: string,
    readonly cryptographyService: CryptographyService,
    readonly config?: EnvConfig,
    readonly logger?: Logger,
  ) {
    this.model = new ProviderModel(db);
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
    const includePassword = params.includePassword !== false;

    let provider: EmailProvider | NoPasswordEmailProvider | undefined;
    try {
      provider = await this.model.getRow({
        providerId: params.providerId,
        organisationId: this.organisationId,
        includePassword,
      });
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
      provider = await this.model.getPrimaryRow(this.organisationId);
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

      deleted = await this.model.softDeleteProvider({
        providerId: params.providerId,
        organisationId: this.organisationId,
        providerName: prefixDeleted(provider.providerName),
        fromAddress: prefixDeleted(provider.fromAddress),
      });
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

    try {
      return await this.model.createProvider({
        organisationId: this.organisationId,
        // Encrypt password before storing it
        encryptedPassword: this.cryptographyService.encrypt(inputBody.password),
        inputBody: {
          providerName: inputBody.providerName,
          smtpHost: inputBody.smtpHost,
          smtpPort: inputBody.smtpPort,
          username: inputBody.username,
          fromAddress: inputBody.fromAddress,
          throttle: inputBody.throttle,
          ssl: inputBody.ssl,
          isPrimary: inputBody.isPrimary,
          headers: inputBody.headers ?? null,
        },
      });
    } catch (error) {
      throw httpErrors.createError(500, "failed to insert email provider", {
        parent: error,
      });
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

    let updatedCount = 0;
    try {
      // Encrypt password before storing it, only when a new one is provided
      const encryptedPassword =
        inputBody.password && inputBody.password.length > 0
          ? this.cryptographyService.encrypt(inputBody.password)
          : undefined;

      updatedCount = await this.model.updateProvider({
        organisationId: this.organisationId,
        providerId: inputBody.id,
        encryptedPassword,
        inputBody: {
          providerName: inputBody.providerName,
          smtpHost: inputBody.smtpHost,
          smtpPort: inputBody.smtpPort,
          username: inputBody.username,
          fromAddress: inputBody.fromAddress,
          throttle: inputBody.throttle,
          ssl: inputBody.ssl,
          isPrimary: inputBody.isPrimary,
          headers: inputBody.headers ?? null,
        },
      });
    } catch (error) {
      throw httpErrors.createError(500, "failed to update email provider", {
        parent: error,
      });
    }

    if (!updatedCount) {
      throw httpErrors.notFound(FAILED_TO_FIND);
    }
  }

  async list(params: {
    isPrimary: boolean | undefined;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: ProvidersList; totalCount: number }> {
    try {
      const totalCount = await this.model.countRows({
        organisationId: this.organisationId,
        isPrimary: params.isPrimary,
      });
      if (totalCount === 0) {
        return { data: [], totalCount: 0 };
      }

      const data = await this.model.listRows({
        organisationId: this.organisationId,
        isPrimary: params.isPrimary,
        limit: params.pagination.limit,
        offset: params.pagination.offset,
      });

      return { data, totalCount };
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
    const addressExists = await this.model.existsByNameOrAddress({
      organisationId: params.organisationId,
      fromAddress: params.inputBody.fromAddress,
      providerName: params.inputBody.providerName,
      providerIdToIgnore: params.providerIdToIgnore,
    });

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
}

/**
 * Back-compat wrapper preserving the original pool-based constructor used by
 * the background job processor and existing tests. Delegates all behaviour to
 * {@link EmailProviderService} over a Kysely instance built from the pool.
 */
export class EmailSpecificProvider extends EmailProviderService {
  readonly pool: Pool;

  constructor(
    pool: Pool,
    organisationId: string,
    cryptographyService: CryptographyService,
    config?: EnvConfig,
    logger?: Logger,
  ) {
    super(
      createDbFromPool<DB>(pool),
      organisationId,
      cryptographyService,
      config,
      logger,
    );
    this.pool = pool;
  }
}
