import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import {
  ScheduledEventModel,
  type ScheduleTaskInput,
} from "../../models/scheduled-event-model.js";

/**
 * Business logic for the `scheduled_events` domain. Composes
 * {@link ScheduledEventModel} so the tasks route stays a thin controller.
 *
 * Behaviour is intentionally identical to the previous inline insert in the
 * tasks route handler.
 */
export class ScheduledEventService {
  private readonly model: ScheduledEventModel;

  constructor(db: Kysely<DB>) {
    this.model = new ScheduledEventModel(db);
  }

  async scheduleTasks(tasks: ScheduleTaskInput[]): Promise<void> {
    await this.model.insertScheduledTasks(tasks);
  }
}

/**
 * Build a {@link ScheduledEventService} from a raw pg {@link Pool}. Provided for
 * backward-compatible callers (and tests) that still pass a pool; the tasks
 * route constructs the service from `app.db` directly.
 */
export const scheduledEventServiceFromPool = (
  pool: Pool,
): ScheduledEventService =>
  new ScheduledEventService(createDbFromPool<DB>(pool));
