import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../db/schema.js";
import { SettingsModel } from "../models/settings-model.js";

/** How a stored settings value should be interpreted when read back. */
export enum CONFIG_TYPE {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
}

/**
 * Business logic for the `settings` domain read path. Composes
 * {@link SettingsModel} and reproduces the exact value-coercion previously done
 * in the `getConfigValue` free function.
 *
 * Only the non-transactional pool read is served here; the boot-time
 * `storeConfig` upsert remains on raw pg in `utils/storeConfig.ts`.
 */
export class SettingsService {
  private readonly model: SettingsModel;

  constructor(db: Kysely<DB>) {
    this.model = new SettingsModel(db);
  }

  async getConfigValue(
    key: string,
  ): Promise<string | number | boolean | undefined> {
    const row = await this.model.getByKey(key);
    if (!row) {
      return undefined;
    }

    const { value, type } = row;
    switch (type) {
      case CONFIG_TYPE.STRING: {
        return value;
      }
      case CONFIG_TYPE.NUMBER: {
        return parseInt(value, 10);
      }
      case CONFIG_TYPE.BOOLEAN: {
        return Boolean(value);
      }
    }

    return undefined;
  }
}

/**
 * Build a {@link SettingsService} from a raw pg {@link Pool}. Used by the
 * backward-compatible `getConfigValue` wrapper (and tests) that still pass a
 * pool.
 */
export const settingsServiceFromPool = (pool: Pool): SettingsService =>
  new SettingsService(createDbFromPool<DB>(pool));
