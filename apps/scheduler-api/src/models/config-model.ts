import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";

/**
 * Resolved worker configuration as consumed by the scheduler worker loop. The
 * property names mirror the aliases used by the previous raw-pg query in
 * `worker.ts` so the downstream `Config` shape stays identical.
 */
export interface WorkerConfigRow {
  interval: number;
  size: number;
  maxRetries: number;
  callbackTimeout: number;
}

/**
 * Data-access model for the `config` domain. Extends the shared
 * {@link BaseModel} for the `config` table and exposes the single worker-config
 * read that `worker.ts` needs.
 *
 * The finder reproduces the previous raw-pg SQL verbatim (same column aliases
 * and single-row projection) via the shared `sql` tag on `app.db`. The aliases
 * are already camelCase, so the shared `CamelCasePlugin` leaves the result keys
 * untouched and no JSON/`::text` workaround is needed.
 */
export class ConfigModel extends BaseModel<DB, "config"> {
  constructor(db: Kysely<DB>) {
    super(db, "config");
  }

  /**
   * Fetch the worker configuration row. Mirrors the `select ... from config`
   * query previously inlined in `worker`; returns `undefined` when the table is
   * empty so the caller can apply its default configuration.
   */
  async getWorkerConfig(): Promise<WorkerConfigRow | undefined> {
    const result = await sql<WorkerConfigRow>`
  select 
    base_interval_ms as interval,
    select_size as size,
    max_retries as "maxRetries",
    http_callback_timeout_ms as "callbackTimeout"
  from config
  `.execute(this.db);

    return result.rows.at(0);
  }
}
