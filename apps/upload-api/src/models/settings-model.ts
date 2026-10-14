import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";

/** A single settings row as read by the config lookup. */
export interface SettingConfigRow {
  key: string;
  value: string;
  type: string;
}

/**
 * Data-access model for the `settings` domain. Extends the shared
 * {@link BaseModel} for the `settings` table and exposes the single config
 * lookup used to resolve runtime configuration values.
 *
 * The finder reproduces the previous raw-pg SQL verbatim
 * (`SELECT key, value, type FROM settings WHERE key = $1`) via the shared `sql`
 * tag on `app.db`. All selected columns are single words, so the shared
 * `CamelCasePlugin` leaves the result keys untouched and no JSON/`::text`
 * workaround is needed.
 *
 * The `storeConfig` upsert (a boot-time write) remains on raw pg in
 * `utils/storeConfig.ts` and is intentionally not represented here.
 */
export class SettingsModel extends BaseModel<DB, "settings"> {
  constructor(db: Kysely<DB>) {
    super(db, "settings");
  }

  /**
   * Fetch a settings row by key. Mirrors the read in the previous
   * `getConfigValue`; returns `undefined` when the key does not exist.
   */
  async getByKey(key: string): Promise<SettingConfigRow | undefined> {
    const result =
      await sql<SettingConfigRow>`SELECT key, value, type FROM settings WHERE key = ${key}`.execute(
        this.db,
      );

    return result.rows.at(0);
  }
}
