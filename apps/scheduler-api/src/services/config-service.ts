import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../db/schema.js";
import { ConfigModel, type WorkerConfigRow } from "../models/config-model.js";

/**
 * Fallback worker configuration used when the `config` table is empty. Matches
 * the inline default previously used by `worker` in `worker.ts`.
 */
const DEFAULT_WORKER_CONFIG: WorkerConfigRow = {
  size: 200,
  interval: 10 * 1000,
  callbackTimeout: 5000,
  maxRetries: 5,
};

/**
 * Business logic for the `config` domain. Composes {@link ConfigModel} and
 * applies the default-configuration fallback so the worker stays a thin caller.
 *
 * Behaviour is intentionally identical to the previous inline config read in
 * `worker` (same query, same default fallback).
 */
export class ConfigService {
  private readonly model: ConfigModel;

  constructor(db: Kysely<DB>) {
    this.model = new ConfigModel(db);
  }

  async getWorkerConfig(): Promise<WorkerConfigRow> {
    const config = await this.model.getWorkerConfig();
    return config ?? DEFAULT_WORKER_CONFIG;
  }
}

/**
 * Build a {@link ConfigService} from a raw pg {@link Pool}. Provided for
 * backward-compatible callers (and tests) that still pass a pool; the worker
 * constructs the service from `app.db` directly.
 */
export const configServiceFromPool = (pool: Pool): ConfigService =>
  new ConfigService(createDbFromPool<DB>(pool));
