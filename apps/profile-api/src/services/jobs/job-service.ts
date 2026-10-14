import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import { JobModel } from "~/models/job-model.js";

/**
 * Business logic for the `jobs` domain. Composes {@link JobModel} for data
 * access and keeps the token-comparison logic here so route handlers stay thin
 * controllers.
 *
 * Behaviour is intentionally identical to the previous `verifyToken` free
 * function, which remains as a thin delegator for backward compatibility.
 */
export class JobService {
  private readonly model: JobModel;

  constructor(db: Kysely<DB>) {
    this.model = new JobModel(db);
  }

  async verifyToken(params: {
    profileImportId: string;
    token: string;
  }): Promise<boolean> {
    const jobToken = await this.model.getJobToken(params.profileImportId);
    if (!jobToken) {
      return false;
    }
    return jobToken === params.token;
  }
}

/**
 * Build a {@link JobService} from a raw pg {@link Pool}. Used by the
 * backward-compatible `verifyToken` wrapper (and tests) that still pass a pool;
 * route handlers instead construct the service from `app.db` directly.
 */
export const jobServiceFromPool = (pool: Pool): JobService =>
  new JobService(createDbFromPool<DB>(pool));
