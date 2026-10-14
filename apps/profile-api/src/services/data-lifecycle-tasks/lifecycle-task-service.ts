import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import dayjs from "dayjs";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import { LifecycleTaskModel } from "~/models/lifecycle-task-model.js";
import type { GetLifecycleTask } from "~/schemas/data-lifecycle-tasks/get-many-user-export.js";
import { LifecycleTaskTypes } from "~/schemas/data-lifecycle-tasks/index.js";

function isLifecycleTask(t: unknown): t is GetLifecycleTask {
  if (typeof t !== "object" || t === null) {
    return false;
  }

  const task = t as Record<string, unknown>;

  const baseCheck =
    typeof task.id === "string" &&
    typeof task.type === "string" &&
    typeof task.status === "string";

  if (!baseCheck) {
    return false;
  }

  if (task.metadata !== undefined) {
    if (typeof task.metadata !== "object" || task.metadata === null) {
      return false;
    }

    const metadata = task.metadata as Record<string, unknown>;

    if (
      metadata.type === LifecycleTaskTypes.ExportUserData &&
      metadata.expiresAt !== undefined &&
      typeof metadata.expiresAt === "string" &&
      !dayjs(metadata.expiresAt).isValid()
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Business logic for the `data_lifecycle_tasks` read paths. Composes
 * {@link LifecycleTaskModel} for data access and keeps the row validation here,
 * so callers stay thin.
 *
 * Behaviour is intentionally identical to the previous `getTasks` free
 * function, which remains as a thin delegator for backward compatibility.
 */
export class LifecycleTaskService {
  private readonly model: LifecycleTaskModel;

  constructor(db: Kysely<DB>) {
    this.model = new LifecycleTaskModel(db);
  }

  async getTasks(params: {
    profileId: string | null;
    taskType: string | null;
  }): Promise<GetLifecycleTask[]> {
    const lifecycleTasks = await this.model.listTasks(params);

    if (!lifecycleTasks.every((task) => isLifecycleTask(task))) {
      throw new Error("invalid data parsed");
    }

    return lifecycleTasks;
  }
}

/**
 * Build a {@link LifecycleTaskService} from a raw pg {@link Pool}. Used by the
 * backward-compatible `getTasks` wrapper (and the route handler tests) that
 * still pass a pool; route handlers instead construct the service from
 * `app.db` directly.
 */
export const lifecycleTaskServiceFromPool = (
  pool: Pool,
): LifecycleTaskService => new LifecycleTaskService(createDbFromPool<DB>(pool));
