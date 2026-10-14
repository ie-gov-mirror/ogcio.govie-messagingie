import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "~/db/schema.js";

/**
 * Data-access model for the `jobs` domain. Jobs are authenticated against the
 * `profile_imports.job_token` column, so this model extends {@link BaseModel}
 * for the `profileImports` table and exposes the single token lookup that the
 * job routes need.
 *
 * The finder reproduces the previous raw-pg SQL verbatim
 * (`SELECT job_token FROM profile_imports WHERE id = $1`) via the shared `sql`
 * tag on `app.db`.
 */
export class JobModel extends BaseModel<DB, "profileImports"> {
  constructor(db: Kysely<DB>) {
    super(db, "profileImports");
  }

  /**
   * Fetch the `job_token` for a profile import. Mirrors
   * `getJobTokenForProfileImport`; returns `undefined` when the import does not
   * exist.
   */
  async getJobToken(id: string): Promise<string | undefined> {
    const result = await sql<{ jobToken: string }>`
      SELECT job_token as "jobToken" FROM profile_imports WHERE id = ${id};
    `.execute(this.db);

    return result.rows[0]?.jobToken;
  }
}
