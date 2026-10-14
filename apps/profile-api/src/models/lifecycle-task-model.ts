import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "~/db/schema.js";

/** The raw shape produced by {@link LifecycleTaskModel.listTasks}, mirroring the
 * previous `getTasks` row mapping before validation. */
export interface LifecycleTaskListRow {
  id: string;
  type: string;
  status: string;
  metadata: unknown;
}

/**
 * Data-access model for the `data_lifecycle_tasks` table. Extends the shared
 * {@link BaseModel} and adds the paginated-free list finder used by the
 * lifecycle-tasks routes.
 *
 * The finder reproduces the previous raw-pg SQL verbatim via the shared `sql`
 * tag on `app.db`.
 *
 * Deliberate deviation: `metadata` is a JSONB column whose nested keys must
 * survive verbatim (e.g. `requested_by_user_id`, `expiresAt`). The shared
 * Kysely instance runs the `CamelCasePlugin`, which recursively camel-cases
 * nested JSON object keys, so the column is cast to `::text` here and re-parsed
 * with `JSON.parse`, which the plugin leaves untouched.
 */
export class LifecycleTaskModel extends BaseModel<DB, "dataLifecycleTasks"> {
  constructor(db: Kysely<DB>) {
    super(db, "dataLifecycleTasks");
  }

  /**
   * List lifecycle tasks, optionally filtered by profile and/or task type.
   * Mirrors the previous `getTasks` SQL (same columns, filters and ordering).
   */
  async listTasks(params: {
    profileId: string | null;
    taskType: string | null;
  }): Promise<LifecycleTaskListRow[]> {
    const { profileId, taskType } = params;

    const result = await sql<{
      id: string;
      taskType: string;
      status: string;
      metadata: string | null;
    }>`
      SELECT
        id,
        task_type as "taskType",
        status,
        metadata::text as metadata
      FROM data_lifecycle_tasks
      WHERE (${profileId}::text IS NULL OR profile_id = ${profileId}) AND (${taskType}::text IS NULL OR task_type = ${taskType})
      ORDER BY task_type, created_at DESC
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      type: row.taskType,
      status: row.status,
      metadata: row.metadata === null ? null : JSON.parse(row.metadata),
    }));
  }
}
