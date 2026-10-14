import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";

/** A single task to schedule, matching the tasks route request body items. */
export interface ScheduleTaskInput {
  webhookUrl: string;
  webhookAuth: string;
  executeAt: string;
}

/**
 * Data-access model for the `scheduled_events` domain. Extends the shared
 * {@link BaseModel} for the `scheduled_events` table and exposes the bulk insert
 * used by the tasks route.
 *
 * The insert reproduces the previous raw-pg statement verbatim (same target
 * columns and multi-row `VALUES` layout, one positional parameter per value)
 * via the shared `sql` tag on `app.db`.
 *
 * The transactional/locking worker paths (`SELECT ... FOR UPDATE SKIP LOCKED`
 * plus the event-log/status write) and the batched cleanup transaction remain
 * on raw pg and are intentionally not represented here.
 */
export class ScheduledEventModel extends BaseModel<DB, "scheduledEvents"> {
  constructor(db: Kysely<DB>) {
    super(db, "scheduledEvents");
  }

  /**
   * Insert one or more scheduled events. Mirrors the previous
   * `insert into scheduled_events(webhook_url, webhook_auth, execute_at)
   * values (...)` statement, keeping the same column order and per-row
   * parameterisation.
   */
  async insertScheduledTasks(tasks: ScheduleTaskInput[]): Promise<void> {
    const rows = tasks.map(
      (task) =>
        sql`(${task.webhookUrl}, ${task.webhookAuth}, ${task.executeAt})`,
    );

    await sql`
            insert into scheduled_events(
                webhook_url, webhook_auth, execute_at
            ) values ${sql.join(rows)}
        `.execute(this.db);
  }
}
